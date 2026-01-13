# palm_pass_processing_v1.py
import os
# Prevent OpenCV from polling local hardware sensors to avoid the UVC error
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'  # Suppress TensorFlow warnings

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import requests
import cv2
import numpy as np
import time
import threading
import json
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageTk

# Scientific Image Processing
from skimage.filters import frangi, hessian
from skimage.morphology import skeletonize, remove_small_objects, thin

# TensorFlow imports
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.models import Model

# ------------------- Configuration -------------------
# ESP32 IP Address
ESP_IP = "192.168.1.40"
CAPTURE_URL = f"http://{ESP_IP}/capture"
STREAM_URL_PRIMARY = f"http://{ESP_IP}:81/stream"   # Fast Stream
STREAM_URL_BACKUP = f"http://{ESP_IP}/stream"       # Fallback

CAPTURE_SIZE = "HD"  # High Res for processing

# Local storage paths
DATABASE_DIR = Path("vein_database")
TEMPLATES_DIR = DATABASE_DIR / "templates"
LOGS_DIR = DATABASE_DIR / "logs"

# Create directories if they don't exist
DATABASE_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)
LOGS_DIR.mkdir(exist_ok=True)

# Matching threshold (cosine similarity)
MATCH_THRESHOLD = 0.70

# ------------------- Feature Extractor Setup -------------------
class VeinFeatureExtractor:

    def __init__(self):
        self.clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8,8))

    # ================= PHYSICS =================
    def preprocess(self, img):
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

        # Remove illumination field
        blur = cv2.GaussianBlur(gray, (251,251), 0)
        blur[blur == 0] = 1
        norm = cv2.divide(gray, blur, scale=255)

        norm = cv2.normalize(norm, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)

        # Local contrast
        clahe = self.clahe.apply(norm)

        # Kill pore noise
        clahe = cv2.GaussianBlur(clahe, (5,5), 0)

        return clahe

    # ================= VEIN DETECTION =================
    def detect_veins(self, img):
        f = img.astype(np.float32) / 255.0

        vessels = frangi(
            f,
            scale_range=(2,8),
            scale_step=2,
            alpha=0.5,
            beta=0.5,
            gamma=15
        )

        vessels = rescale_intensity(vessels, out_range=(0,255)).astype(np.uint8)
        return vessels

    # ================= BINARIZE =================
    def binarize(self, img):
        b = cv2.adaptiveThreshold(
            img,255,
            cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
            cv2.THRESH_BINARY,
            31,-5
        )

        b = b > 0
        b = remove_small_objects(b, min_size=40)
        return b.astype(np.uint8)

    # ================= TOPOLOGY =================
    def skeleton(self, bin_img):
        skel = skeletonize(bin_img > 0)
        return skel.astype(np.uint8)

    # ================= SHADOW KILLER =================
    def suppress_shadow(self, skel):
        h,w = skel.shape
        yy,xx = np.mgrid[:h,:w]
        cx,cy = w//2,h//2
        dist = np.sqrt((xx-cx)**2 + (yy-cy)**2)
        mask = dist < (0.7 * dist.max())
        return skel * mask

    # ================= FEATURES =================
    def extract_features(self, skel):
        kernel = np.array([[1,1,1],[1,10,1],[1,1,1]],dtype=np.uint8)
        neigh = cv2.filter2D(skel,-1,kernel)

        endpoints = np.sum(neigh == 11)
        bifurcations = np.sum(neigh >= 13)

        grid = 32
        h,w = skel.shape
        feat = []

        for y in range(0,h,grid):
            for x in range(0,w,grid):
                block = skel[y:y+grid,x:x+grid]
                feat.append(np.sum(block)/max(block.size,1))

        feat.insert(0, endpoints/1000)
        feat.insert(1, bifurcations/1000)

        feat = np.array(feat,dtype=np.float32)
        feat /= np.linalg.norm(feat)+1e-6
        return feat

    # ================= FULL PIPELINE =================
    def process(self, img):
        img = cv2.resize(img,(400,400))

        enhanced = self.preprocess(img)
        vessels = self.detect_veins(enhanced)
        binary = self.binarize(vessels)
        skel = self.skeleton(binary)
        skel = self.suppress_shadow(skel)

        features = self.extract_features(skel)

        vis = cv2.cvtColor(enhanced,cv2.COLOR_GRAY2RGB)
        vis[skel>0]=(0,255,0)

        return vis, features

# ------------------- Database Functions -------------------
def save_template(user_id, name, features, vein_image):
    template_path = TEMPLATES_DIR / f"{user_id}.json"
    image_path = TEMPLATES_DIR / f"{user_id}_vein.png"
    cv2.imwrite(str(image_path), vein_image)
    
    template_data = {
        "user_id": user_id,
        "name": name,
        "features": features.tolist(),
        "registered_at": datetime.now().isoformat(),
        "image_path": str(image_path)
    }
    
    with open(template_path, 'w') as f:
        json.dump(template_data, f, indent=2)
    print(f"✓ Template saved: {user_id}")
    return True

def load_all_templates():
    templates = []
    for template_file in TEMPLATES_DIR.glob("*.json"):
        try:
            with open(template_file, 'r') as f:
                data = json.load(f)
                data['features'] = np.array(data['features'])
                templates.append(data)
        except Exception as e:
            print(f"Error loading {template_file}: {e}")
    return templates

def match_template(query_features, threshold=MATCH_THRESHOLD):
    templates = load_all_templates()
    if not templates:
        return None, 0.0, "No templates registered"
    
    best_match = None
    best_score = 0.0
    
    for template in templates:
        similarity = np.dot(query_features, template['features'])
        if similarity > best_score:
            best_score = similarity
            best_match = template
    
    if best_score >= threshold:
        return best_match, best_score, "Match found"
    else:
        return None, best_score, f"No match (best: {best_score:.3f})"

def log_attendance(user_id, name, score, mode):
    log_file = LOGS_DIR / f"log_{datetime.now().strftime('%Y%m%d')}.json"
    log_entry = {
        "user_id": user_id,
        "name": name,
        "score": float(score),
        "mode": mode,
        "timestamp": datetime.now().isoformat()
    }
    
    logs = []
    if log_file.exists():
        with open(log_file, 'r') as f:
            try: logs = json.load(f)
            except: pass
    
    logs.append(log_entry)
    with open(log_file, 'w') as f:
        json.dump(logs, f, indent=2)

# ------------------- Main GUI -------------------
class PalmVeinMasterGUI:
    def __init__(self, root):
        self.root = root
        self.root.title("PalmVein Pro - High Performance")
        self.root.geometry("1400x900")
        self.root.configure(bg="#0a192f")

        self.current_mode = tk.StringVar(value="attendance")
        self.live_feed_active = False
        self.current_image = None
        self.step_images = {}
        self.extracted_features = None

        # Initialize the feature extractor
        self.feature_extractor = VeinFeatureExtractor()
        
        self.setup_ui()

    def setup_ui(self):
        # --- SIDEBAR ---
        self.sidebar = tk.Frame(self.root, bg="#112240", width=320, relief=tk.RIDGE, bd=1)
        self.sidebar.pack(side=tk.LEFT, fill=tk.Y, padx=10, pady=10)

        tk.Label(self.sidebar, text="🖐️ Palm Vein Pro", font=("Arial", 14, "bold"), 
                 bg="#112240", fg="#64ffda").pack(pady=15)

        # Mode Selection
        mode_frame = tk.LabelFrame(self.sidebar, text="Select Mode", bg="#112240", fg="white")
        mode_frame.pack(fill=tk.X, padx=15, pady=5)
        for text, mode in [("Registration", "registration"), ("Attendance/Verify", "attendance")]:
            tk.Radiobutton(mode_frame, text=text, variable=self.current_mode, value=mode, 
                           bg="#112240", fg="white", selectcolor="#233554").pack(anchor=tk.W, padx=10)

        # Camera Controls
        self.btn_live = tk.Button(self.sidebar, text="📹 Start Live Feed", command=self.toggle_live, 
                                  bg="#4caf50", fg="white", font=("Arial", 10, "bold"))
        self.btn_live.pack(fill=tk.X, padx=15, pady=5, ipady=3)

        tk.Button(self.sidebar, text="📸 Capture HD Image", command=self.capture_ir, 
                  bg="#00bcd4", fg="black", font=("Arial", 10, "bold")).pack(fill=tk.X, padx=15, pady=5, ipady=3)

        # --- MANUAL PIPELINE STEPS ---
        pipe_frame = tk.LabelFrame(self.sidebar, text="Manual Processing Steps", bg="#112240", fg="white")
        pipe_frame.pack(fill=tk.BOTH, expand=True, padx=15, pady=5)

        btn_style = {"bg": "#233554", "fg": "#ccd6f6", "anchor": "w", "padx": 10, "relief": tk.GROOVE, "bd": 1}

        tk.Label(pipe_frame, text="PRE-PROCESSING", bg="#112240", fg="yellow", font=("Arial", 8, "bold")).pack(pady=2)
        tk.Button(pipe_frame, text="1. Grayscale (IR Chan)", command=self.step_grayscale, **btn_style).pack(fill=tk.X)
        tk.Button(pipe_frame, text="2. Denoise (Bilateral)", command=self.step_denoise, **btn_style).pack(fill=tk.X)
        tk.Button(pipe_frame, text="3. Isolate Palm ROI", command=self.step_roi, **btn_style).pack(fill=tk.X)

        tk.Label(pipe_frame, text="CONTRAST & ENHANCEMENT", bg="#112240", fg="yellow", font=("Arial", 8, "bold")).pack(pady=2)
        tk.Button(pipe_frame, text="4a. Global Equalize", command=self.step_equalize, **btn_style).pack(fill=tk.X)
        tk.Button(pipe_frame, text="4b. CLAHE", command=self.step_clahe, **btn_style).pack(fill=tk.X)
        tk.Button(pipe_frame, text="5. Black-Hat (Normalized)", command=self.step_blackhat, **btn_style).pack(fill=tk.X)

        tk.Label(pipe_frame, text="VEIN REFINEMENT", bg="#112240", fg="yellow", font=("Arial", 8, "bold")).pack(pady=2)
        tk.Button(pipe_frame, text="6. Adaptive (Backup)", command=self.step_adaptive_threshold, **btn_style).pack(fill=tk.X)
        tk.Button(pipe_frame, text="7. Morphology Cleanup", command=self.step_cleanup, **btn_style).pack(fill=tk.X)

        # Action Buttons
        tk.Label(self.sidebar, text="", bg="#112240").pack(pady=5)
        
        tk.Button(self.sidebar, text="🔍 Extract Features", command=self.extract_features_gui,
                  bg="#9c27b0", fg="white", font=("Arial", 10, "bold")).pack(fill=tk.X, padx=15, pady=3)
        
        tk.Button(self.sidebar, text="💾 Register User", command=self.register_user, 
                  bg="#4caf50", fg="white", font=("Arial", 10, "bold")).pack(fill=tk.X, padx=15, pady=3)
        
        tk.Button(self.sidebar, text="✓ Verify/Match", command=self.verify_user,
                  bg="#2196f3", fg="white", font=("Arial", 10, "bold")).pack(fill=tk.X, padx=15, pady=3)
        
        tk.Button(self.sidebar, text="📋 View Database", command=self.view_database,
                  bg="#ff9800", fg="white", font=("Arial", 9, "bold")).pack(fill=tk.X, padx=15, pady=3)
        
        tk.Button(self.sidebar, text="🔄 Reset", command=self.reset_system, 
                  bg="#f44336", fg="white", font=("Arial", 9, "bold")).pack(fill=tk.X, padx=15, pady=3)

        self.status_lbl = tk.Label(self.sidebar, text="Ready", bg="#112240", fg="#64ffda", 
                                   wraplength=280, justify=tk.LEFT, font=("Arial", 9))
        self.status_lbl.pack(side=tk.BOTTOM, pady=5)

        # --- DISPLAY AREA ---
        self.display_area = tk.Frame(self.root, bg="#0a192f")
        self.display_area.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)
        self.img_label = tk.Label(self.display_area, bg="#0a192f")
        self.img_label.pack(expand=True)
        self.step_title = tk.Label(self.display_area, text="", bg="#0a192f", fg="#ffaa00", font=("Arial", 14))
        self.step_title.pack(side=tk.BOTTOM, pady=20)

    # ------------------- MANUAL PROCESSING STEPS -------------------

    def step_grayscale(self):
        if self.current_image is None: 
            messagebox.showwarning("No Image", "Please capture an image first!")
            return
        # If image is grayscale already (1 channel), just use it
        if len(self.current_image.shape) == 2:
            ir = self.current_image
        else:
            ir = self.current_image[:, :, 2] # Extract Red channel (IR often strongest here)
        self.step_images["gray"] = ir
        self.display(ir, "Step 1: IR Grayscale")
        self.status_lbl.config(text="✓ Step 1 complete")

    def step_denoise(self):
        if "gray" not in self.step_images: 
            messagebox.showwarning("Order Error", "Please run Step 1 first!")
            return
        denoised = cv2.bilateralFilter(self.step_images["gray"], 9, 80, 80)
        self.step_images["denoised"] = denoised
        self.display(denoised, "Step 2: Denoised (Bilateral)")
        self.status_lbl.config(text="✓ Step 2 complete")

    def step_roi(self):
        if "denoised" not in self.step_images: 
            messagebox.showwarning("Order Error", "Please run Step 2 first!")
            return
        img = self.step_images["denoised"]
        
        # 1. Create Mask
        _, mask = cv2.threshold(img, 45, 255, cv2.THRESH_BINARY)
        kernel = np.ones((5,5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if contours:
            c = max(contours, key=cv2.contourArea)
            
            # --- ROTATION CORRECTION START ---
            # Fit an ellipse to the hand to find its angle
            if len(c) > 5:
                (x, y), (MA, ma), angle = cv2.fitEllipse(c)
                
                # Handle angle ambiguity (we assume hand is roughly pointing up)
                # fitEllipse returns 0-180. Vertical is usually near 0 or 180.
                if angle > 90:
                    rotation_angle = angle - 180
                else:
                    rotation_angle = angle
                
                # If rotation is huge (e.g. horizontal), ignore it to prevent errors
                # We only want to correct small tilts (+/- 30 degrees)
                if abs(rotation_angle) < 30:
                    h, w = img.shape[:2]
                    M = cv2.getRotationMatrix2D((x, y), rotation_angle, 1.0)
                    
                    # Rotate both the image and the mask
                    img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC)
                    mask_clean = np.zeros_like(mask)
                    cv2.drawContours(mask_clean, [c], -1, 255, -1)
                    mask_clean = cv2.warpAffine(mask_clean, M, (w, h), flags=cv2.INTER_NEAREST)
                    
                    # Re-find contour on the rotated mask to get new bounding box
                    contours_rot, _ = cv2.findContours(mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                    if contours_rot:
                        c = max(contours_rot, key=cv2.contourArea)
            # --- ROTATION CORRECTION END ---

            # Standard masking and cropping (same as before)
            mask_final = np.zeros_like(mask)
            cv2.drawContours(mask_final, [c], -1, 255, -1)
            bg_removed = cv2.bitwise_and(img, img, mask=mask_final)
            
            x, y, w, h = cv2.boundingRect(c)
            m = 20
            roi = bg_removed[max(0, y-m):min(img.shape[0], y+h+m), 
                             max(0, x-m):min(img.shape[1], x+w+m)]
            
            roi = cv2.resize(roi, (512, 512))
            
            self.step_images["roi"] = roi
            self.display(roi, "Step 3: ROI (Auto-Aligned)")
            self.status_lbl.config(text="✓ Step 3 complete (Aligned)")
        else:
            messagebox.showerror("Error", "Could not find palm contour")

    def step_equalize(self):
        if "roi" not in self.step_images: return
        res = cv2.equalizeHist(self.step_images["roi"])
        self.step_images["enhanced"] = res
        self.display(res, "Step 4a: Global Equalization")

    def step_clahe(self):
        if "roi" not in self.step_images: return
        clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        res = clahe.apply(self.step_images["roi"])
        self.step_images["enhanced"] = res
        self.display(res, "Step 4b: CLAHE Enhanced")
        self.status_lbl.config(text="✓ Step 4b complete")

    def step_blackhat(self):
        if "enhanced" not in self.step_images: return
        
        img = self.step_images["enhanced"]
        
        # 1. Use a larger kernel for Black-Hat to capture thicker veins
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
        blackhat = cv2.morphologyEx(img, cv2.MORPH_BLACKHAT, kernel)
        
        # 2. Critical: Use CLAHE on the Black-Hat result itself to boost local vein contrast
        clahe = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8,8))
        blackhat_boosted = clahe.apply(blackhat)
        
        # 3. Normalize to full 0-255 range
        blackhat_norm = cv2.normalize(blackhat_boosted, None, 0, 255, cv2.NORM_MINMAX)
        
        self.step_images["blackhat"] = blackhat_norm
        self.display(blackhat_norm, "Step 5: Enhanced Black-Hat")

    def step_adaptive_threshold(self):
        if "blackhat" not in self.step_images: return
        img = self.step_images["blackhat"]
        
        blurred = cv2.GaussianBlur(img, (5, 5), 0)
        binary = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, 
                                       cv2.THRESH_BINARY, 25, -4)
        
        kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
        clean = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel)
        
        self.step_images["binary"] = clean
        self.step_images["final"] = clean 
        self.display(clean, "Step 6b: Tuned Adaptive")
        self.status_lbl.config(text="✓ Step 6b complete")

    def step_cleanup(self):
        if "binary" not in self.step_images: return
        img = self.step_images["binary"]
        
        kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
        closed = cv2.morphologyEx(img, cv2.MORPH_CLOSE, kernel_close)
        
        bool_img = closed > 0
        cleaned = remove_small_objects(bool_img, min_size=100) 
        
        result = (cleaned * 255).astype(np.uint8)
        
        self.step_images["cleaned"] = result
        self.step_images["final"] = result 
        self.display(result, "Step 7: Morphology Cleanup")
        self.status_lbl.config(text="✓ Step 7 complete")
        
    # ------------------- FEATURE EXTRACTION -------------------
    def extract_features_gui(self):
        if "final" not in self.step_images:
            messagebox.showwarning("No Pattern", "Please complete processing steps first!")
            return
        
        def extract():
            try:
                self.status_lbl.config(text="Extracting features...")
                vein_image = self.step_images["final"]
                features = self.feature_extractor.extract_features(vein_image)
                
                if features is None:
                    self.status_lbl.config(text="✗ Feature extraction failed - insufficient vein data")
                    messagebox.showerror("Error", "Could not extract features. Please ensure clear vein patterns are visible.")
                    return
                
                self.extracted_features = features
                self.status_lbl.config(text=f"✓ Features Extracted")
                messagebox.showinfo("Success", f"Vector dimension: {len(features)}\nReady for registration")
            except Exception as e:
                self.status_lbl.config(text=f"Feature extraction failed")
                messagebox.showerror("Error", f"Extraction failed: {str(e)}")
                print(e)
        
        threading.Thread(target=extract, daemon=True).start()

    def register_user(self):
        if self.extracted_features is None:
            messagebox.showwarning("No Features", "Please extract features first!")
            return
        
        user_id = simpledialog.askstring("Register", "Enter User ID (e.g., STU_001):")
        if not user_id: return
        
        name = simpledialog.askstring("Register", "Enter Full Name:")
        if not name: return
        
        save_template(user_id, name, self.extracted_features, self.step_images["final"])
        self.status_lbl.config(text=f"✓ {name} registered")
        messagebox.showinfo("Success", f"User {name} Registered!")

    def verify_user(self):
        if self.extracted_features is None:
            messagebox.showwarning("No Features", "Please extract features first!")
            return
        
        match, score, message = match_template(self.extracted_features)
        
        if match:
            self.status_lbl.config(text=f"✓ MATCH: {match['name']} ({score:.3f})")
            log_attendance(match['user_id'], match['name'], score, self.current_mode.get())
            messagebox.showinfo("MATCH FOUND", f"User: {match['name']}\nConfidence: {score:.2%}")
            self.show_comparison(match)
        else:
            self.status_lbl.config(text=f"✗ No match ({score:.3f})")
            messagebox.showwarning("No Match", f"User not recognized (Best: {score:.2%})")

    def show_comparison(self, match):
        try:
            registered_img = cv2.imread(match['image_path'], cv2.IMREAD_GRAYSCALE)
            current_img = self.step_images["final"]
            h = 400
            reg_resized = cv2.resize(registered_img, (h, h))
            cur_resized = cv2.resize(current_img, (h, h))
            comparison = np.hstack([reg_resized, cur_resized])
            self.display(comparison, f"Match: {match['name']}")
        except: pass

    def view_database(self):
        templates = load_all_templates()
        if not templates:
            messagebox.showinfo("Database Empty", "No users registered.")
            return
        
        db_window = tk.Toplevel(self.root)
        db_window.title(f"Database ({len(templates)} Users)")
        db_window.geometry("600x400")
        
        tree = ttk.Treeview(db_window, columns=("ID", "Name", "Date"), show="headings")
        tree.heading("ID", text="User ID")
        tree.heading("Name", text="Name")
        tree.heading("Date", text="Registered")
        tree.pack(fill=tk.BOTH, expand=True)
        
        for t in templates:
            tree.insert("", tk.END, values=(t['user_id'], t['name'], t['registered_at'][:10]))

    # ------------------- UPDATED LIVE STREAM -------------------
    def toggle_live(self):
        if self.live_feed_active:
            # STOP Request
            self.live_feed_active = False
            self.btn_live.config(text="Stopping...", bg="#9e9e9e")
            # Thread exits naturally when flag is False
        else:
            # START Request
            self.live_feed_active = True
            self.btn_live.config(text="⏹ Stop Feed", bg="#f44336")
            threading.Thread(target=self._live_stream, daemon=True).start()

    def _live_stream(self):
        # 1. Try connecting to Port 81 (Standard Video Stream Port)
        print(f"Connecting to {STREAM_URL_PRIMARY}...")
        cap = cv2.VideoCapture(STREAM_URL_PRIMARY)
        cap.set(cv2.CAP_PROP_BUFFERSIZE, 1) # Low latency

        # 2. Fallback to Port 80 if 81 fails
        if not cap.isOpened():
            print(f"Port 81 failed, trying {STREAM_URL_BACKUP}...")
            cap = cv2.VideoCapture(STREAM_URL_BACKUP)
        
        if not cap.isOpened():
            messagebox.showerror("Stream Error", "Could not connect to video stream.\nCheck IP and Wi-Fi.")
            self.live_feed_active = False
            self.btn_live.config(text="📹 Start Live Feed", bg="#4caf50")
            return

        print("✓ Stream connected!")

        while self.live_feed_active and cap.isOpened():
            ret, frame = cap.read()
            if ret:
                # If you need to mirror the software preview:
                # frame = cv2.flip(frame, 1)

                self.current_image = frame
                self.display(frame, "Live Stream (MJPEG)")
            else:
                print("Frame lost")
                break
        
        cap.release()
        self.btn_live.config(text="📹 Start Live Feed", bg="#4caf50")

    def capture_ir(self):
        # This function fetches a HIGH RES still image for processing
        self.live_feed_active = False
        self.btn_live.config(text="📹 Start Live Feed", bg="#4caf50")
        try:
            self.status_lbl.config(text="Capturing HD...")
            resp = requests.get(f"{CAPTURE_URL}?size={CAPTURE_SIZE}", timeout=5)
            img = cv2.imdecode(np.frombuffer(resp.content, np.uint8), cv2.IMREAD_COLOR)
            if img is not None:
                self.current_image = img
                self.display(img, "Raw HD Captured")
                self.status_lbl.config(text="✓ HD Image Captured")
            else:
                raise Exception("Empty image received")
        except Exception as e:
            messagebox.showerror("Error", f"Capture Failed: {e}")

    def display(self, img, title):
        h, w = img.shape[:2]
        scale = min(800/w, 500/h)
        resized = cv2.resize(img, (int(w*scale), int(h*scale)))
        
        if len(resized.shape) == 2:
            resized = cv2.cvtColor(resized, cv2.COLOR_GRAY2RGB)
        else:
            resized = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        
        img_tk = ImageTk.PhotoImage(Image.fromarray(resized))
        self.img_label.config(image=img_tk)
        self.img_label.image = img_tk
        self.step_title.config(text=title)

    def reset_system(self):
        self.live_feed_active = False
        self.current_image = None
        self.step_images = {}
        self.extracted_features = None
        self.img_label.config(image="")
        self.step_title.config(text="System Reset")
        self.status_lbl.config(text="Ready")

if __name__ == "__main__":
    print("Initializing Palm Vein System...")
    print("Loading TensorFlow models (this may take a moment)...")
    feature_extractor = VeinFeatureExtractor()
    print("✓ System Ready!")
    
    root = tk.Tk()
    app = PalmVeinMasterGUI(root)
    root.mainloop()