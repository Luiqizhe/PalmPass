import os
import logging
import warnings

# =============================================================================
# 0. CONFIG & SILENCING
# =============================================================================
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '3'
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
os.environ["OPENCV_FFMPEG_LOGLEVEL"] = "0"

warnings.filterwarnings('ignore')

import absl.logging
absl.logging.set_verbosity(absl.logging.ERROR)

import tkinter as tk
from tkinter import ttk, messagebox, simpledialog
import requests
import cv2
import numpy as np
import serial
import threading
import time
import json
import shutil
import urllib.request
from collections import deque
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageTk

# --- MediaPipe ---
import mediapipe as mp
from mediapipe.tasks import python
from mediapipe.tasks.python import vision

# --- Scientific Image Processing ---
try:
    from skimage.morphology import skeletonize, remove_small_objects, thin
    HAS_SKIMAGE = True
except ImportError:
    HAS_SKIMAGE = False
    print("WARNING: scikit-image not found. Run 'pip install scikit-image'")

# --- Firebase ---
import firebase_admin
from firebase_admin import credentials, firestore

# ==================== CONFIGURATION ====================
ESP_IP = "192.168.1.40"
CAPTURE_URL = f"http://{ESP_IP}/capture"
STREAM_URL_PRIMARY = f"http://{ESP_IP}:81/stream"   # Fast Stream
CAPTURE_SIZE = "UXGA"  # High res for capture
PREVIEW_SCALE = 1.0    
SERIAL_PORT = "COM8"
SERIAL_BAUD = 115200

DATABASE_DIR = Path("vein_database_hybrid")
TEMPLATES_DIR = DATABASE_DIR / "templates"
INDEX_FILE = DATABASE_DIR / "student_index.json"
DATABASE_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)

MATCH_THRESHOLD = 0.70
CAPTURE_COOLDOWN = 3.0 
FIREBASE_CRED_PATH = "INSERT_YOUR_FIREBASE_CREDENTIALS_FILE_PATH"

FACULTY_DATA = [
    {
        "code": "FAIX",
        "programs": [
            "BAXZ - Bachelor of Computer Science (Computer Security) with Honours ",
            "BAXI - Bachelor of Computer Science (Artificial Intelligence) with Honours"
        ]
    }
]

# ==================== GLOBAL VARS & HELPERS ====================
db = None
ser = None

def init_firebase():
    global db
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CRED_PATH)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        return True
    except: return False

def init_serial():
    global ser
    try:
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=1)
        time.sleep(2)
        return True
    except: return False

def send_lcd_command(command, data=""):
    """Sends command in format COMMAND:DATA\n"""
    global ser
    if ser and ser.is_open:
        try: ser.write(f"{command}:{data}\n".encode())
        except: pass

# --- UPDATED HELPER FOR UNDO SUPPORT ---
def update_firebase_attendance(matric_no, exam_id):
    if not db: return None, None
    try:
        doc_id = f"{exam_id}_{matric_no}"
        doc_ref = db.collection('ATTENDANCE').document(doc_id)
        doc = doc_ref.get()
        if doc.exists:
            data = doc.to_dict()
            if data.get('status') == 'Pending':
                doc_ref.update({'status': 'Present', 'timestamp': firestore.SERVER_TIMESTAMP})
                # Return Table No AND Doc ID for undo tracking
                return data.get('table_no', 'N/A'), doc_id
            else: return "ALREADY_MARKED", doc_id
        return None, None
    except: return None, None

# --- UPDATED HELPER FOR UNDO SUPPORT ---
def update_bathroom_log(attendance_id):
    if not db: return None, None
    try:
        # Check if they are currently OUT
        query = db.collection('BATHROOM_LOG').where('attendance_id', '==', attendance_id).where('status', '==', 'OUT').limit(1)
        docs = list(query.stream())
        
        if docs:
            # Student is returning (Delete the OUT record)
            doc = docs[0]
            backup_data = doc.to_dict() # Backup data before delete
            doc.reference.delete()
            return "RETURNED", backup_data # Return backup data to restore if undone
        else:
            # Student is leaving (Create OUT record)
            _, new_ref = db.collection('BATHROOM_LOG').add({
                'attendance_id': attendance_id,
                'exit_time': firestore.SERVER_TIMESTAMP,
                'status': 'OUT'
            })
            return "OUT", new_ref.id # Return new ID to delete if undone
    except: return None, None

# ==================== THREADED CAMERA CLASS ====================
class ThreadedCamera:
    def __init__(self, src, downsample_scale=0.5):
        self.capture = cv2.VideoCapture(src)
        self.capture.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        self.downsample_scale = downsample_scale
        self.lock = threading.Lock()
        self.frame = None
        self.status = False
        self.is_running = False
        self.thread = None

    def start(self):
        if self.is_running: return
        self.is_running = True
        self.thread = threading.Thread(target=self.update, daemon=True)
        self.thread.start()

    def update(self):
        while self.is_running:
            if self.capture.isOpened():
                status, frame = self.capture.read()
                if status:
                    if self.downsample_scale < 1.0:
                        h, w = frame.shape[:2]
                        frame = cv2.resize(frame, (int(w * self.downsample_scale), int(h * self.downsample_scale)))
                    with self.lock:
                        self.frame = frame
                        self.status = status
                else:
                    time.sleep(0.1)
            else:
                time.sleep(0.1)

    def get_frame(self):
        with self.lock:
            if self.frame is not None:
                return self.status, self.frame.copy()
            return False, None

    def stop(self):
        self.is_running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.0)
        if self.capture.isOpened():
            self.capture.release()

# ==================== HAND TRACKER ====================
class HandTracker:
    def __init__(self):
        self.model_path = 'hand_landmarker.task'
        model_url = 'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task'
        if not os.path.exists(self.model_path):
            urllib.request.urlretrieve(model_url, self.model_path)

        BaseOptions = mp.tasks.BaseOptions
        HandLandmarker = mp.tasks.vision.HandLandmarker
        HandLandmarkerOptions = mp.tasks.vision.HandLandmarkerOptions
        VisionRunningMode = mp.tasks.vision.RunningMode

        options = HandLandmarkerOptions(
            base_options=BaseOptions(model_asset_path=self.model_path),
            running_mode=VisionRunningMode.VIDEO,
            num_hands=1,
            min_hand_detection_confidence=0.5,
            min_hand_presence_confidence=0.5,
            min_tracking_confidence=0.5
        )
        self.detector = HandLandmarker.create_from_options(options)
        self.frames_stable = 0
        self.last_bbox = None
        self.start_time = time.time()

    def process(self, frame):
        h, w = frame.shape[:2]
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        mp_image = mp.Image(image_format=mp.ImageFormat.SRGB, data=frame_rgb)
        timestamp_ms = int((time.time() - self.start_time) * 1000)
        
        detection_result = self.detector.detect_for_video(mp_image, timestamp_ms)
        
        if detection_result.hand_landmarks:
            hand_landmarks = detection_result.hand_landmarks[0]
            x_min, y_min = w, h
            x_max, y_max = 0, 0
            for lm in hand_landmarks:
                x, y = int(lm.x * w), int(lm.y * h)
                x_min = min(x_min, x)
                x_max = max(x_max, x)
                y_min = min(y_min, y)
                y_max = max(y_max, y)
            
            pad = 40
            x_min, y_min = max(0, x_min - pad), max(0, y_min - pad)
            x_max, y_max = min(w, x_max + pad), min(h, y_max + pad)
            box = (x_min, y_min, x_max - x_min, y_max - y_min)
            
            palm_x, palm_y = hand_landmarks[9].x * w, hand_landmarks[9].y * h
            dist = np.sqrt((palm_x - w//2)**2 + (palm_y - h//2)**2)
            score = max(0, 100 - int(dist * 0.3))
            
            if self.last_bbox:
                if abs(self.last_bbox[0] - box[0]) < 20: 
                    self.frames_stable += 1
                    score += 20
                else: self.frames_stable = 0
            
            self.last_bbox = box
            return True, min(100, score), box
        
        self.frames_stable = 0
        return False, 0, None

    def is_ready(self): return self.frames_stable > 5
    def close(self): self.detector.close()

# ==================== VEIN FEATURE EXTRACTOR ====================
class VeinFeatureExtractor:
    def __init__(self):
        if not HAS_SKIMAGE:
            raise ImportError("scikit-image is required.")
        
        self.clahe_standard = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
        self.clahe_strong = cv2.createCLAHE(clipLimit=4.0, tileGridSize=(8,8))

    def extract_features(self, img, bbox=None):
        try:
            if bbox is not None:
                x, y, w, h = bbox
                img = img[max(0, y):min(img.shape[0], y+h), max(0, x):min(img.shape[1], x+w)]

            if img is None or img.size == 0: return None, None

            # 1. Grayscale
            if len(img.shape) == 3: gray = img[:, :, 2] 
            else: gray = img

            # 2. Denoise
            denoised = cv2.bilateralFilter(gray, 9, 80, 80)

            # 3. ROI & Rotation
            roi = self._get_rotated_roi(denoised)
            if roi is None: return None, None
            roi = cv2.resize(roi, (400, 400))

            # 4. Equalize
            equalized = cv2.equalizeHist(roi)
            
            # 5. CLAHE
            enhanced = self.clahe_standard.apply(equalized)

            # 6. Blackhat
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
            blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, kernel)
            blackhat_boosted = self.clahe_strong.apply(blackhat)
            blackhat_norm = cv2.normalize(blackhat_boosted, None, 0, 255, cv2.NORM_MINMAX)

            # 7. Adaptive Threshold
            blurred = cv2.GaussianBlur(blackhat_norm, (5, 5), 0)
            binary = cv2.adaptiveThreshold(blurred, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, 25, -4)
            kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel_open)

            # 8. Cleanup (FINAL VISUAL STAGE)
            kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5, 5))
            closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close)
            bool_img = closed > 0
            cleaned = remove_small_objects(bool_img, min_size=100)
            cleaned_uint8 = (cleaned * 255).astype(np.uint8)

            # --- INTERNAL MATH ONLY ---
            skel = thin(cleaned)
            skel_uint8 = (skel * 255).astype(np.uint8)
            features = self._calculate_vector(skel_uint8)

            # --- VISUALIZATION ---
            vis_img = cv2.cvtColor(cleaned_uint8, cv2.COLOR_GRAY2RGB)

            return vis_img, features

        except Exception as e:
            print(f"Extraction Error: {e}")
            return None, None

    def _get_rotated_roi(self, img):
        _, mask = cv2.threshold(img, 45, 255, cv2.THRESH_BINARY)
        kernel = np.ones((5,5), np.uint8)
        mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
        mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
        
        contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        if not contours: return img
        
        c = max(contours, key=cv2.contourArea)
        if len(c) > 5:
            (x, y), (MA, ma), angle = cv2.fitEllipse(c)
            rotation_angle = angle - 180 if angle > 90 else angle
            if abs(rotation_angle) < 30:
                h, w = img.shape[:2]
                M = cv2.getRotationMatrix2D((x, y), rotation_angle, 1.0)
                img = cv2.warpAffine(img, M, (w, h), flags=cv2.INTER_CUBIC)
                mask_clean = np.zeros_like(mask)
                cv2.drawContours(mask_clean, [c], -1, 255, -1)
                mask_clean = cv2.warpAffine(mask_clean, M, (w, h), flags=cv2.INTER_NEAREST)
                contours_rot, _ = cv2.findContours(mask_clean, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
                if contours_rot: c = max(contours_rot, key=cv2.contourArea)

        mask_final = np.zeros_like(mask)
        cv2.drawContours(mask_final, [c], -1, 255, -1)
        bg_removed = cv2.bitwise_and(img, img, mask=mask_final)
        x, y, w, h = cv2.boundingRect(c)
        margin = 20
        roi = bg_removed[max(0, y-margin):min(img.shape[0], y+h+margin), max(0, x-margin):min(img.shape[1], x+w+margin)]
        return roi if roi.size > 0 else img

    def _calculate_vector(self, skel):
        kernel = np.array([[1, 1, 1], [1, 10, 1], [1, 1, 1]], dtype=np.uint8)
        neighbor_map = cv2.filter2D(skel, -1, kernel)
        num_endpoints = np.sum(neighbor_map == 11)
        num_bifurcations = np.sum(neighbor_map >= 13)
        h, w = skel.shape
        grid_size = 32
        features = []
        for y in range(0, h, grid_size):
            for x in range(0, w, grid_size):
                block = skel[y:y+grid_size, x:x+grid_size]
                density = np.sum(block) / max(block.size, 1)
                features.append(density)
        features.insert(0, num_endpoints / 1000.0)
        features.insert(1, num_bifurcations / 1000.0)
        vec = np.array(features, dtype=np.float32)
        norm = np.linalg.norm(vec)
        return vec / norm if norm > 0 else vec

# ==================== DATABASE HELPERS ====================
def save_template(matric, name, faculty, program, features, img_rgb, hand_side="primary"):
    student_folder = TEMPLATES_DIR / matric / hand_side
    student_folder.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    np.save(student_folder / f"vec_{timestamp}.npy", features)
    save_img = img_rgb if len(img_rgb.shape) == 2 else cv2.cvtColor(img_rgb, cv2.COLOR_RGB2BGR)
    cv2.imwrite(str(student_folder / f"img_{timestamp}.jpg"), save_img)
    index_data = {}
    if INDEX_FILE.exists():
        with open(INDEX_FILE, 'r') as f: index_data = json.load(f)
    if matric not in index_data:
        index_data[matric] = {"name": name, "faculty": faculty, "program": program, "templates": []}
    index_data[matric]["templates"].append({
        "hand": hand_side, 
        "path": str(student_folder / f"vec_{timestamp}.npy"),
        "img_path": str(student_folder / f"img_{timestamp}.jpg")
    })
    with open(INDEX_FILE, 'w') as f: json.dump(index_data, f, indent=4)

def find_match(live_vec):
    if not INDEX_FILE.exists(): return None, 0
    best_score = 0
    best_match = None
    with open(INDEX_FILE, 'r') as f: data = json.load(f)
    for matric, info in data.items():
        scores = []
        for t in info["templates"]:
            if os.path.exists(t["path"]):
                saved = np.load(t["path"])
                sim = np.dot(live_vec, saved)
                scores.append(sim)
        if scores:
            s = np.mean(sorted(scores, reverse=True)[:2])
            if s > best_score:
                best_score = s
                best_match = {"matric": matric, "name": info["name"]}
    return best_match, best_score

def delete_user_data(matric):
    if not INDEX_FILE.exists(): return
    with open(INDEX_FILE, 'r') as f: data = json.load(f)
    if matric in data:
        del data[matric]
        with open(INDEX_FILE, 'w') as f: json.dump(data, f, indent=4)
    user_dir = TEMPLATES_DIR / matric
    if user_dir.exists(): shutil.rmtree(user_dir)

# ==================== DATABASE GUI ====================
class DatabaseManager:
    def __init__(self, parent):
        self.window = tk.Toplevel(parent)
        self.window.title("Database Manager")
        self.center_window(self.window, 900, 600)
        self.window.configure(bg="#0f1729")
        tk.Label(self.window, text="Student Database", bg="#0f1729", fg="#60a5fa", font=("Arial", 16, "bold")).pack(pady=10)
        toolbar = tk.Frame(self.window, bg="#0f1729")
        toolbar.pack(fill=tk.X, padx=20, pady=5)
        tk.Button(toolbar, text="👁 View", command=self.view_samples, bg="#2563eb", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(toolbar, text="🗑 Delete", command=self.delete_user, bg="#dc2626", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(toolbar, text="🔄 Re-register", command=self.re_register, bg="#f59e0b", fg="white").pack(side=tk.LEFT, padx=5)
        tk.Button(toolbar, text="Close", command=self.window.destroy, bg="#475569", fg="white").pack(side=tk.RIGHT)
        self.tree = ttk.Treeview(self.window, columns=('matric', 'name', 'faculty', 'count'), show='headings')
        self.tree.heading('matric', text='Matric'); self.tree.heading('name', text='Name')
        self.tree.heading('faculty', text='Faculty'); self.tree.heading('count', text='Samples')
        self.tree.pack(fill=tk.BOTH, expand=True, padx=20, pady=10)
        self.refresh()
    
    def center_window(self, window, width, height):
        x = (window.winfo_screenwidth() // 2) - (width // 2)
        y = (window.winfo_screenheight() // 2) - (height // 2)
        window.geometry(f"{width}x{height}+{x}+{y}")

    def refresh(self):
        for i in self.tree.get_children(): self.tree.delete(i)
        if INDEX_FILE.exists():
            with open(INDEX_FILE, 'r') as f:
                data = json.load(f)
                for m, i in data.items():
                    self.tree.insert('', tk.END, values=(m, i['name'], i.get('faculty','N/A'), len(i['templates'])))

    def get_selected(self):
        sel = self.tree.selection()
        if not sel: return None
        return self.tree.item(sel[0])['values'][0]

    def view_samples(self):
        matric = self.get_selected()
        if not matric: return
        viewer = tk.Toplevel(self.window)
        viewer.title(f"Samples: {matric}")
        self.center_window(viewer, 800, 350)
        viewer.configure(bg="black")
        frame = tk.Frame(viewer, bg="black")
        frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        with open(INDEX_FILE, 'r') as f: data = json.load(f)
        if matric in data:
            for t in data[matric]['templates']:
                if os.path.exists(t['img_path']):
                    img = Image.open(t['img_path'])
                    img.thumbnail((200, 200))
                    photo = ImageTk.PhotoImage(img)
                    lbl = tk.Label(frame, image=photo, bg="black", bd=2, relief=tk.RAISED)
                    lbl.image = photo 
                    lbl.pack(side=tk.LEFT, padx=10)

    def delete_user(self):
        matric = self.get_selected()
        if matric and messagebox.askyesno("Confirm", "Delete this user?"):
            delete_user_data(str(matric))
            self.refresh()

    def re_register(self):
        matric = self.get_selected()
        if matric and messagebox.askyesno("Confirm", "Delete data to re-register?"):
            delete_user_data(str(matric))
            self.refresh()
            self.window.destroy()

# ==================== MAIN APP ====================
class PalmPass:
    def __init__(self, root):
        self.root = root
        self.root.title("PalmPass")
        self.root.geometry("1280x800")
        self.root.configure(bg="#0f1729")
        
        self.init_hardware()
        
        self.tracker = HandTracker()
        self.extractor = VeinFeatureExtractor()
        
        self.cam_thread = None
        self.is_streaming = False
        self.processing = False
        self.waiting_confirmation = False 
        self.auto_capture_enabled = False
        self.temp_samples = []
        self.last_capture_time = 0
        self.update_job = None
        
        # --- UNDO STATE ---
        self.last_transaction = None 
        
        self.mode = tk.StringVar(value="registration")
        self.exam_subject = tk.StringVar()
        self.exam_map = {}
        
        self.build_gui()

    def init_hardware(self):
        init_serial()
        init_firebase()
        send_lcd_command("IDLE")

    def build_gui(self):
        main_frame = tk.Frame(self.root, bg="#0f1729")
        main_frame.pack(fill=tk.BOTH, expand=True, padx=10, pady=10)
        
        # --- LEFT PANEL ---
        left_panel = tk.Frame(main_frame, bg="#1a2332", width=320)
        left_panel.pack(side=tk.LEFT, fill=tk.Y, padx=(0, 10))
        left_panel.pack_propagate(False)
        
        tk.Label(left_panel, text="🖐 PalmPass", font=("Arial", 20, "bold"), bg="#1a2332", fg="white").pack(pady=20)
        
        # Mode Selection
        mode_frame = tk.LabelFrame(left_panel, text="Mode", bg="#1a2332", fg="white")
        mode_frame.pack(fill=tk.X, padx=15, pady=10)
        for t, v in [("📝 Registration", "registration"), ("✅ Exam Attendance", "exam"), ("🚻 Bathroom Log", "bathroom")]:
            tk.Radiobutton(mode_frame, text=t, variable=self.mode, value=v, bg="#1a2332", fg="white", selectcolor="#2a3f5f", command=self.on_mode_change).pack(anchor=tk.W, padx=10)
        
        self.dynamic_frame = tk.Frame(left_panel, bg="#1a2332")
        self.dynamic_frame.pack(fill=tk.X, padx=15, pady=5)
        self.build_dynamic_controls()
        
        # Control Buttons
        btn_frame = tk.Frame(left_panel, bg="#1a2332")
        btn_frame.pack(fill=tk.X, padx=15, pady=10)
        self.stream_btn = tk.Button(btn_frame, text="▶ Start Stream", command=self.toggle_stream, bg="#4caf50", fg="white", height=2)
        self.stream_btn.pack(fill=tk.X, pady=5)
        self.auto_btn = tk.Button(btn_frame, text="⚡ Enable Auto-Capture", command=self.toggle_auto, bg="#475569", fg="white", height=2, state=tk.DISABLED)
        self.auto_btn.pack(fill=tk.X, pady=5)
        self.capture_btn = tk.Button(btn_frame, text="📷 Manual Capture", command=self.manual_capture, bg="#2563eb", fg="white", height=2, state=tk.DISABLED)
        self.capture_btn.pack(fill=tk.X, pady=5)
        
        # --- UNDO BUTTON ---
        self.undo_btn = tk.Button(btn_frame, text="↩ Undo Last Action", command=self.perform_undo, bg="#dc2626", fg="white", height=2, state=tk.DISABLED)
        self.undo_btn.pack(fill=tk.X, pady=5)
        
        tk.Button(btn_frame, text="💾 Database", command=lambda: DatabaseManager(self.root), bg="#f59e0b", fg="white", height=2).pack(fill=tk.X, pady=5)
        
        self.status_label = tk.Label(left_panel, text="Offline", bg="#1e3a5f", fg="white", relief=tk.SOLID)
        self.status_label.pack(fill=tk.X, padx=15, pady=10, ipady=5)

        # --- RIGHT PANEL ---
        right_panel = tk.Frame(main_frame, bg="#000000")
        right_panel.pack(side=tk.LEFT, fill=tk.BOTH, expand=True)
        
        self.video_canvas = tk.Canvas(right_panel, bg="#111827", highlightthickness=0)
        self.video_canvas.pack(fill=tk.BOTH, expand=True)
        self.video_canvas.create_text(400, 300, text="Press Start...", font=("Arial", 20), fill="#4b5563")
        
        self.result_label = tk.Label(right_panel, text="READY", font=("Arial", 14, "bold"), bg="#000000", fg="#6b7280")
        self.result_label.pack(fill=tk.X, pady=5)
        
        log_frame = tk.LabelFrame(right_panel, text="Log", bg="#000000", fg="#475569")
        log_frame.pack(fill=tk.X, side=tk.BOTTOM, padx=20, pady=10)
        self.log_text = tk.Text(log_frame, height=4, bg="#0f1729", fg="#94a3b8", font=("Consolas", 10))
        self.log_text.pack(fill=tk.BOTH, padx=5, pady=5)

    def log(self, msg, color="#94a3b8"):
        self.log_text.insert(tk.END, datetime.now().strftime("[%H:%M] ") + msg + "\n")
        self.log_text.see(tk.END)
        self.result_label.config(text=msg, fg=color)

    def build_dynamic_controls(self):
        for w in self.dynamic_frame.winfo_children(): w.destroy()
        
        if self.mode.get() == "registration":
            lbl = tk.LabelFrame(self.dynamic_frame, text="Instructions", bg="#1a2332", fg="white")
            lbl.pack(fill=tk.X)
            tk.Label(lbl, text="Place hand on sensor.\n1 Sample Required.", bg="#1a2332", fg="#94a3b8").pack(padx=5, pady=5)
        else:
            lbl = tk.LabelFrame(self.dynamic_frame, text="Select Exam", bg="#1a2332", fg="white")
            lbl.pack(fill=tk.X)
            display_list = []
            self.exam_map = {} 
            if db:
                try:
                    docs = db.collection('EXAM').stream()
                    for doc in docs:
                        data = doc.to_dict()
                        e_id = data.get('exam_id', doc.id)
                        e_name = data.get('subject', data.get('exam_name', 'Unnamed'))
                        display_str = f"{e_id} - {e_name}"
                        display_list.append(display_str)
                        self.exam_map[display_str] = e_id
                except Exception as e: self.log(f"DB Error: {e}", "#dc2626")

            combo = ttk.Combobox(lbl, textvariable=self.exam_subject, values=display_list, state="readonly")
            if display_list: self.exam_subject.set(display_list[0])
            combo.pack(fill=tk.X, padx=5, pady=5)

    def on_mode_change(self):
        self.build_dynamic_controls()
        self.temp_samples = []
        self.last_transaction = None # Clear undo stack on mode change
        self.undo_btn.config(state=tk.DISABLED)
        send_lcd_command("IDLE")
        self.log(f"Mode: {self.mode.get()}")

    def toggle_stream(self):
        if self.is_streaming: self.stop_stream()
        else: self.start_stream()

    def start_stream(self):
        if self.is_streaming: return
        self.is_streaming = True
        self.stream_btn.config(text="🛑 Stop Stream", bg="#dc2626")
        self.auto_btn.config(state=tk.NORMAL)
        self.capture_btn.config(state=tk.NORMAL)
        if self.update_job: self.root.after_cancel(self.update_job)
        self.cam_thread = ThreadedCamera(STREAM_URL_PRIMARY, downsample_scale=PREVIEW_SCALE)
        self.cam_thread.start()
        self.update_loop()

    def stop_stream(self):
        self.is_streaming = False
        self.stream_btn.config(text="▶ Start Stream", bg="#4caf50")
        self.auto_btn.config(state=tk.DISABLED, bg="#475569", text="⚡ Enable Auto-Capture")
        self.capture_btn.config(state=tk.DISABLED)
        self.auto_capture_enabled = False
        if self.update_job: self.root.after_cancel(self.update_job)
        if self.cam_thread: self.cam_thread.stop()
        self.video_canvas.delete("all")
        self.video_canvas.create_text(400, 300, text="Stopped", font=("Arial", 20), fill="#4b5563")

    def toggle_auto(self):
        self.auto_capture_enabled = not self.auto_capture_enabled
        self.auto_btn.config(bg="#22c55e" if self.auto_capture_enabled else "#475569")
        self.tracker.frames_stable = 0

    def update_loop(self):
        if not self.is_streaming: return
        if self.cam_thread:
            status, frame = self.cam_thread.get_frame()
            if status and not self.processing and not self.waiting_confirmation:
                frame = cv2.flip(frame, 1)
                found, quality, box = self.tracker.process(frame)
                if found:
                    x, y, w, h = box
                    color = (0, 255, 0) if quality > 80 else (0, 255, 255)
                    cv2.rectangle(frame, (x, y), (x+w, y+h), color, 2)
                    cv2.putText(frame, f"Quality: {quality}%", (x, y-10), cv2.FONT_HERSHEY_SIMPLEX, 0.5, color, 2)
                    if self.auto_capture_enabled and self.tracker.is_ready():
                        if time.time() - self.last_capture_time > CAPTURE_COOLDOWN:
                            self.processing = True
                            self.last_capture_time = time.time()
                            threading.Thread(target=self.perform_capture, args=(box,), daemon=True).start()
                            cv2.putText(frame, "CAPTURING...", (50, 50), cv2.FONT_HERSHEY_SIMPLEX, 1, (0, 255, 0), 2)
                self.show_frame(frame)
        if self.is_streaming: self.update_job = self.root.after(40, self.update_loop)

    def show_frame(self, frame):
        rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        w = self.video_canvas.winfo_width()
        h = self.video_canvas.winfo_height()
        if w > 10 and h > 10:
            frame_h, frame_w = rgb.shape[:2]
            if w/h > frame_w/frame_h:
                new_h = h; new_w = int(frame_w * (h/frame_h))
            else:
                new_w = w; new_h = int(frame_h * (w/frame_w))
            img = Image.fromarray(rgb).resize((new_w, new_h), Image.Resampling.BILINEAR)
        else: img = Image.fromarray(rgb)
        self.photo = ImageTk.PhotoImage(img)
        self.video_canvas.delete("all")
        self.video_canvas.create_image(w//2, h//2, image=self.photo)

    def manual_capture(self):
        if not self.processing and not self.waiting_confirmation:
            if self.mode.get() == "registration" and len(self.temp_samples) >= 1:
                messagebox.showinfo("Limit", "1 Sample captured.")
                return
            self.processing = True
            threading.Thread(target=self.perform_capture, args=(None,), daemon=True).start()

    def perform_capture(self, bbox=None):
        try:
            self.root.after(0, lambda: self.status_label.config(text="Processing..."))
            self.log("Capturing HD...")
            send_lcd_command("PROCESSING")
            
            resp = requests.get(f"{CAPTURE_URL}?size={CAPTURE_SIZE}", timeout=8)
            if resp.status_code != 200: raise Exception(f"Cam Error: {resp.status_code}")
            hd_img = cv2.imdecode(np.frombuffer(resp.content, np.uint8), cv2.IMREAD_COLOR)
            hd_img = cv2.flip(hd_img, 1)

            if bbox is None:
                found, _, hd_box = self.tracker.process(hd_img)
                bbox = hd_box if found else (int(hd_img.shape[1]*0.2), int(hd_img.shape[0]*0.2), 400, 400)

            vein_img, features = self.extractor.extract_features(hd_img, bbox)
            if features is None: raise Exception("Vein Extract Failed")

            if self.mode.get() == "registration":
                match, score = find_match(features)
                if match and score > MATCH_THRESHOLD:
                    msg = f"VEIN PATTERN REGISTERED AS {match['matric']}"
                    self.log(msg, "#ef4444")
                    send_lcd_command("ERR_VEIN")
                    self.root.after(0, lambda: messagebox.showwarning("Duplicate", msg))
                    self.root.after(2000, lambda: send_lcd_command("IDLE"))
                    return 
                self.waiting_confirmation = True
                self.root.after(0, lambda: self.show_preview_dialog(vein_img, features))
            
            elif self.mode.get() == "exam":
                self.handle_attendance(features)
            elif self.mode.get() == "bathroom":
                self.handle_bathroom(features)

        except Exception as e:
            self.log(f"Error: {e}", "#dc2626")
            self.waiting_confirmation = False
            self.root.after(2000, lambda: send_lcd_command("IDLE"))
        finally:
            self.processing = False
            self.root.after(0, lambda: self.status_label.config(text="Ready"))

    # ==================== UNDO LOGIC ====================
    def perform_undo(self):
        if not self.last_transaction: return
        
        tx = self.last_transaction
        action_type = tx.get('type')
        matric = tx.get('matric')
        
        try:
            if action_type == 'attendance':
                # Revert status to Pending and remove timestamp
                db.collection('ATTENDANCE').document(tx['doc_id']).update({
                    'status': 'Pending',
                    'timestamp': firestore.DELETE_FIELD
                })
                self.log(f"Reset {matric}'s status to Pending", "#f59e0b")
                send_lcd_command("IDLE") # Clear display
                
            elif action_type == 'bathroom_out':
                # Student was marked OUT, so we delete that entry (as if they never left)
                db.collection('BATHROOM_LOG').document(tx['doc_id']).delete()
                self.log(f"Undo OUT for {matric}", "#f59e0b")
                
            elif action_type == 'bathroom_return':
                # Student was marked RETURNED (doc deleted), so we restore the doc
                # This puts them back in "OUT" status
                db.collection('BATHROOM_LOG').add(tx['backup_data'])
                self.log(f"Undo RETURN for {matric} (Status: OUT)", "#f59e0b")

            self.last_transaction = None
            self.undo_btn.config(state=tk.DISABLED)
            
        except Exception as e:
            self.log(f"Undo Failed: {e}", "#dc2626")

    # ==================== HANDLERS ====================
    def handle_attendance(self, vector):
        match, score = find_match(vector)
        conf_pct = int(score * 100)
        
        if match and score >= MATCH_THRESHOLD:
            name = match['name']
            matric = match['matric']
            selected_text = self.exam_subject.get()
            raw_exam_id = self.exam_map.get(selected_text, selected_text)
            
            # Helper now returns doc_id too
            table, doc_id = update_firebase_attendance(matric, raw_exam_id)
            
            if table == "ALREADY_MARKED": 
                self.log(f"STUDENT ALREADY SCANNED ({conf_pct}%)", "#ef4444") 
                send_lcd_command("ERR_SCAN")
            elif table:
                self.log(f"{name}: TABLE {table} ({conf_pct}%)", "#22c55e") 
                send_lcd_command("ATTENDANCE", f"{matric}|{table}")
                
                # SAVE STATE FOR UNDO
                self.last_transaction = {
                    'type': 'attendance',
                    'matric': matric,
                    'doc_id': doc_id
                }
                self.root.after(0, lambda: self.undo_btn.config(state=tk.NORMAL))
            else: 
                msg = f"{matric} not in {raw_exam_id}"
                self.log(f"{msg} ({conf_pct}%)", "#ef4444") 
                send_lcd_command("NOMATCH")
                self.root.after(0, lambda: messagebox.showwarning("Not Found", f"{matric} record not found in {raw_exam_id}"))
        else: 
            self.log(f"NO MATCH FOUND ({conf_pct}%)", "#ef4444") 
            send_lcd_command("NOMATCH")
        
        self.root.after(3000, lambda: send_lcd_command("IDLE"))
        time.sleep(1)

    def handle_bathroom(self, vector):
        match, score = find_match(vector)
        conf_pct = int(score * 100)
        
        if match and score >= MATCH_THRESHOLD:
            name = match['name']
            matric = match['matric']
            selected_text = self.exam_subject.get()
            raw_exam_id = self.exam_map.get(selected_text, selected_text)
            att_id = f"{raw_exam_id}_{matric}"
            
            # Helper now returns payload data
            res_type, payload = update_bathroom_log(att_id)
            curr_time = datetime.now().strftime("%I:%M %p")

            if res_type == "OUT":
                self.log(f"{name}: OUT ({conf_pct}%)", "#f59e0b") 
                send_lcd_command("BATH_OUT", f"{matric}|{curr_time}")
                
                # SAVE UNDO (Payload is the new Doc ID)
                self.last_transaction = {
                    'type': 'bathroom_out',
                    'matric': matric,
                    'doc_id': payload 
                }
                self.root.after(0, lambda: self.undo_btn.config(state=tk.NORMAL))
                
            elif res_type == "RETURNED":
                self.log(f"{name}: RETURNED ({conf_pct}%)", "#22c55e") 
                send_lcd_command("BATH_IN", f"{matric}|{curr_time}")
                
                # SAVE UNDO (Payload is the deleted data)
                self.last_transaction = {
                    'type': 'bathroom_return',
                    'matric': matric,
                    'backup_data': payload
                }
                self.root.after(0, lambda: self.undo_btn.config(state=tk.NORMAL))
            else: 
                self.log(f"LOG ERROR ({conf_pct}%)", "#ef4444") 
                send_lcd_command("NOMATCH")
        else: 
            self.log(f"NO MATCH FOUND ({conf_pct}%)", "#ef4444") 
            send_lcd_command("NOMATCH")
        
        self.root.after(3000, lambda: send_lcd_command("IDLE"))
        time.sleep(1)

    def center_window(self, window, width, height):
        x = (window.winfo_screenwidth() // 2) - (width // 2)
        y = (window.winfo_screenheight() // 2) - (height // 2)
        window.geometry(f"{width}x{height}+{x}+{y}")

    def show_preview_dialog(self, img_rgb, vector):
        preview = tk.Toplevel(self.root)
        preview.title("Confirm")
        self.center_window(preview, 400, 500)
        preview.configure(bg="#0f1729")
        
        try:
            if img_rgb is not None:
                d_img = cv2.resize(img_rgb, (300, 300))
                photo = ImageTk.PhotoImage(Image.fromarray(d_img))
            else: photo = ImageTk.PhotoImage(Image.new('RGB', (300, 300), "black"))
        except: photo = ImageTk.PhotoImage(Image.new('RGB', (300, 300), "red"))

        tk.Label(preview, image=photo, bd=2, relief="sunken").pack(pady=10)
        preview.photo = photo

        def on_confirm():
            preview.destroy()
            self.waiting_confirmation = False
            self.confirm_registration_sample(vector, img_rgb)
        
        def on_retake():
            preview.destroy()
            self.waiting_confirmation = False
            self.log("Sample Discarded")
            send_lcd_command("IDLE")
        
        def on_close_x():
            preview.destroy()
            self.waiting_confirmation = False
            self.log("Sample Discarded (Window Closed)")
            send_lcd_command("IDLE")

        preview.protocol("WM_DELETE_WINDOW", on_close_x)

        btn_frame = tk.Frame(preview, bg="#0f1729")
        btn_frame.pack(pady=20)
        tk.Button(btn_frame, text="Retake", command=on_retake, bg="#dc2626", fg="white", width=10).pack(side=tk.LEFT, padx=10)
        tk.Button(btn_frame, text="Confirm", command=on_confirm, bg="#22c55e", fg="white", width=10).pack(side=tk.LEFT, padx=10)

    def confirm_registration_sample(self, vector, img_rgb):
        self.temp_samples.append((vector, img_rgb))
        count = len(self.temp_samples)
        self.log(f"Sample {count}/1 Saved", "#22c55e")
        
        if count >= 1:
            self.open_registration_dialog()

    def open_registration_dialog(self):
        if self.auto_capture_enabled:
            self.toggle_auto()

        dialog = tk.Toplevel(self.root)
        dialog.title("Save Student")
        self.center_window(dialog, 500, 450)
        dialog.configure(bg="#1a2332")
        
        tk.Label(dialog, text="Name", bg="#1a2332", fg="white").pack(pady=5)
        name_entry = tk.Entry(dialog, width=40); name_entry.pack(pady=5)
        tk.Label(dialog, text="Matric", bg="#1a2332", fg="white").pack(pady=5)
        matric_entry = tk.Entry(dialog, width=40); matric_entry.pack(pady=5)
        
        tk.Label(dialog, text="Faculty", bg="#1a2332", fg="white").pack(pady=5)
        fac_var = tk.StringVar()
        fac_combo = ttk.Combobox(dialog, width=40, textvariable=fac_var, values=[f['code'] for f in FACULTY_DATA], state="readonly")
        fac_combo.pack(pady=5)
        
        tk.Label(dialog, text="Program", bg="#1a2332", fg="white").pack(pady=5)
        prog_var = tk.StringVar()
        prog_combo = ttk.Combobox(dialog, width=40, textvariable=prog_var, state="readonly")
        prog_combo.pack(pady=5)
        
        def on_fac_change(*args):
            for f in FACULTY_DATA:
                if f['code'] == fac_var.get():
                    prog_combo['values'] = f['programs']
                    prog_var.set('')
                    break
        fac_var.trace("w", on_fac_change)
        
        def save():
            name = name_entry.get()
            matric = matric_entry.get()
            
            # --- CHECK: Does matric already exist textually? ---
            if INDEX_FILE.exists():
                with open(INDEX_FILE, 'r') as f: index_data = json.load(f)
                if matric in index_data:
                    messagebox.showwarning("Duplicate", f"{matric} already registered")
                    return

            if name and matric:
                for vec, img in self.temp_samples:
                    save_template(matric, name, fac_var.get(), prog_var.get(), vec, img, "primary")
                
                if db:
                    program_code = prog_var.get().split()[0]
                    db.collection('STUDENT').document(matric).set({
                        'name': name, 
                        'matric_no': matric, 
                        'faculty': fac_var.get(), 
                        'program': program_code,
                        'registered_at': firestore.SERVER_TIMESTAMP
                    }, merge=True)
                
                # LCD: ID: Matric / REGISTERED
                send_lcd_command("REGISTERED", matric)
                
                messagebox.showinfo("Success", f"VEIN PATTERN REGISTERED AS {matric}")
                self.temp_samples = []
                dialog.destroy()
                self.root.after(2000, lambda: send_lcd_command("IDLE"))
        
        tk.Button(dialog, text="Save", command=save, bg="#22c55e", fg="white").pack(pady=20)

if __name__ == "__main__":
    root = tk.Tk()
    app = PalmPass(root)
    root.mainloop()