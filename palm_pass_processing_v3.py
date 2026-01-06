import os
os.environ["OPENCV_LOG_LEVEL"] = "OFF"
os.environ["OPENCV_VIDEOIO_PRIORITY_MSMF"] = "0"
os.environ['TF_CPP_MIN_LOG_LEVEL'] = '2'

import tkinter as tk
from tkinter import ttk, messagebox
import requests
import cv2
import numpy as np
import time
import threading
import json
from datetime import datetime
from pathlib import Path
from PIL import Image, ImageTk
from collections import deque
import serial

# Firebase Admin SDK
import firebase_admin
from firebase_admin import credentials, firestore

# Scientific Image Processing
from skimage.morphology import remove_small_objects

# TensorFlow
import tensorflow as tf
from tensorflow.keras.applications import MobileNetV2
from tensorflow.keras.applications.mobilenet_v2 import preprocess_input
from tensorflow.keras.models import Model

# ==================== Faculty Data ====================
FACULTY_DATA = [
    {
        "code": "FTMK",
        "programs": [
            "BITC - Bachelor of Computer Science (Computer Networking) with Honours",
            "BITS - Bachelor of Computer Science (Software Development) with Honours",
            "BITA - Bachelor of Technology in Cloud Computing and Application with Honours",
            "BITM - Bachelor of Computer Science (Interactive Media) with Honours",
            "BITD - Bachelor of Computer Science (Database Management) with Honours",
            "BITE - Bachelor of Information Technology (Game Technology) with Honours",
            "DCS - Diploma in Computer Science"
        ]
    },
    {
        "code": "FAIX",
        "programs": [
            "BAXZ - Bachelor of Computer Science (Computer Security) with Honours ",
            "BAXI - Bachelor of Computer Science (Artificial Intelligence) with Honours"
        ]
    },
    {
        "code": "FTKEK",
        "programs": [
            "BERG - Bachelor of Electronics Engineering with Honours",
            "BERR - Bachelor of Computer Engineering with Honours",
            "BERE - Bachelor of Electronics Engineering Technology (Industrial Electronics) with Honours",
            "BERC - Bachelor of Computer Engineering Technology (Computer Systems) with Honours",
            "BERZ - Bachelor of Electronics Engineering Technology (Telecommunications) with Honours",
            "BERT - Bachelor of Electronics Engineering Technology with Honours",
            "BERL - Bachelor of Technology in Industrial Electronic Automation with Honours",
            "BERV - Bachelor of Technology in Internet of Things (IoT) with Honours",
            "BERW - Bachelor of Technology in Telecommunications with Honours",
            "DER - Diploma in Electronic Engineering"
        ]
    },
    {
        "code": "FTKM",
        "programs": [
            "BMKU - Bachelor of Mechanical Engineering with Honours",
            "BMKK - Bachelor of Automotive Engineering with Honours",
            "BMKV - Bachelor of Mechanical Engineering Technology with Honours",
            "BMKM - Bachelor of Mechanical Engineering Technology (Maintenance Technology) with Honours",
            "BMKH - Bachelor of Mechanical Engineering Technology (Refrigeration and Air-Conditioning System) with Honours",
            "BMKA - Bachelor of Mechanical Engineering Technology (Automotive Technology) with Honours",
            "BMKS - Bachelor of Technology in Air-Conditioning and Refrigeration with Honours",
            "BMKF - Bachelor of Technology in Automotive with Honours",
            "DMK - Diploma in Mechanical Engineering"
        ]
    },
    {
        "code": "FTKE",
        "programs": [
            "BELG - Bachelor of Electrical Engineering with Honours",
            "BELM - Bachelor of Mechatronics Engineering with Honours",
            "BELK - Bachelor of Electrical Engineering Technology (Industrial Power) with Honours",
            "BELR - Bachelor of Electrical Engineering Technology (Industrial Automation & Robotics) with Honours",
            "BELT - Bachelor of Electrical Engineering Technology with Honours",
            "BELS - Bachelor of Technology in Electrical System  Maintenance with Honours",
            "DEL - Diploma in Electrical Engineering"
        ]
    },
    {
        "code": "FTKIP",
        "programs": [
            "BMIG - Bachelor of Manufacturing Engineering",
            "BMIF - Bachelor of Industrial Engineering",
            "BMID - Bachelor of Manufacturing Engineering Technology - Product Design",
            "BMIP - Bachelor of Manufacturing Engineering Technology - Process and Technology",
            "BMIW - Bachelor of Manufacturing Engineering Technology",
            "BMIK - Bachelor of Technology in Welding",
            "BMIM - Bachelor of Technology in Industrial Machining",
            "DMI - Diploma of Manufacturing Engineering"
        ]
    },
    {
        "code": "FPTT",
        "programs": [
            "BTEC - Bachelor of Technopreneurship",
            "BTMS - Bachelor of Technology Management (Supply Chain Management & Logistics)",
            "BTMM - Bachelor of Technology Management (High Technology Marketing)",
            "BTMI - Bachelor of Technology Management (Technology Innovation)"
        ]
    }
]

# ==================== Configuration ====================
ESP_IP = "192.168.1.40"
CAPTURE_URL = f"http://{ESP_IP}/capture"
STREAM_URL_PRIMARY = f"http://{ESP_IP}:81/stream"
STREAM_URL_BACKUP = f"http://{ESP_IP}/stream"
CAPTURE_SIZE = "UXGA"

SERIAL_PORT = "COM8"
SERIAL_BAUD = 115200
ser = None

DATABASE_DIR = Path("vein_database")
TEMPLATES_DIR = DATABASE_DIR / "templates"
INDEX_FILE = DATABASE_DIR / "student_index.json"

DATABASE_DIR.mkdir(exist_ok=True)
TEMPLATES_DIR.mkdir(exist_ok=True)

MATCH_THRESHOLD = 0.9
SAMPLES_PER_REGISTRATION = 3  # Collect 3 samples automatically
CAPTURE_COOLDOWN = 3.0

FIREBASE_CRED_PATH = "palmpass-39e86-firebase-adminsdk-fbsvc-66c75e05f1.json"
db = None

# ==================== Firebase ====================
def init_firebase():
    global db
    try:
        if not firebase_admin._apps:
            cred = credentials.Certificate(FIREBASE_CRED_PATH)
            firebase_admin.initialize_app(cred)
        db = firestore.client()
        print("✓ Firebase connected")
        return True
    except Exception as e:
        print(f"✗ Firebase init failed: {e}")
        return False

def update_firebase_attendance(matric_no, exam_name):
    if not db:
        return None
    
    try:
        doc_id = f"{exam_name}_{matric_no}"
        doc_ref = db.collection('ATTENDANCE').document(doc_id)
        doc = doc_ref.get()
        
        if doc.exists:
            data = doc.to_dict()
            if data.get('status') == 'Pending':
                doc_ref.update({
                    'status': 'Present',
                    'timestamp': firestore.SERVER_TIMESTAMP
                })
                table_no = data.get('table_no', 'N/A')
                print(f"✓ Marked Present: {matric_no} at Table {table_no}")
                return table_no
            else:
                print(f"ℹ Already marked: {matric_no}")
                return "ALREADY_MARKED"
        
        print(f"✗ No record: {doc_id}")
        return None
        
    except Exception as e:
        print(f"✗ Firebase error: {e}")
        return None

def update_bathroom_log(attendance_id):
    if not db:
        return None
    
    try:
        # Query for an OUT entry for this attendance_id
        query = db.collection('BATHROOM_LOG').where('attendance_id', '==', attendance_id).where('status', '==', 'OUT').limit(1)
        docs = query.stream()
        
        for doc in docs:
            # Update to RETURNED
            doc.reference.update({
                'status': 'RETURNED',
                'entry_time': firestore.SERVER_TIMESTAMP
            })
            print(f"✓ Bathroom: {attendance_id} returned")
            return "RETURNED"
        
        # No OUT entry, create new OUT entry
        db.collection('BATHROOM_LOG').add({
            'attendance_id': attendance_id,
            'exit_time': firestore.SERVER_TIMESTAMP,
            'status': 'OUT'
        })
        print(f"✓ Bathroom: {attendance_id} out")
        return "OUT"
        
    except Exception as e:
        print(f"✗ Bathroom log error: {e}")
        return None

# ==================== Serial ====================
def init_serial():
    global ser
    try:
        ser = serial.Serial(SERIAL_PORT, SERIAL_BAUD, timeout=1)
        time.sleep(2)
        print(f"✓ Serial connected to {SERIAL_PORT}")
        return True
    except Exception as e:
        print(f"✗ Serial failed: {e}")
        return False

def send_lcd_command(command):
    global ser
    if ser and ser.is_open:
        try:
            ser.write(f"{command}\n".encode())
            print(f"→ LCD: {command}")
            return True
        except Exception as e:
            print(f"✗ LCD error: {e}")
            return False
    return False

# ==================== Feature Extractor ====================
class VeinFeatureExtractor:
    def __init__(self):
        base_model = MobileNetV2(weights='imagenet', include_top=False, 
                                 input_shape=(224, 224, 3), pooling='avg')
        self.model = Model(inputs=base_model.input, outputs=base_model.output)
        self.model.trainable = False
        print("✓ Feature Extractor loaded")
    
    def extract_minutiae_features(self, vein_binary):
        features = []
        kernel = np.ones((3,3), np.uint8)
        skeleton = vein_binary.copy()
        skeleton_bool = (skeleton > 0).astype(np.uint8)
        neighbor_count = cv2.filter2D(skeleton_bool, -1, kernel) - 1
        neighbor_count = neighbor_count * skeleton_bool
        
        end_points = np.argwhere(neighbor_count == 1)
        branch_points = np.argwhere(neighbor_count >= 3)
        features.append(len(branch_points) / 100.0)
        features.append(len(end_points) / 100.0)
        
        h, w = skeleton.shape
        grid_size = 4
        cell_h, cell_w = h // grid_size, w // grid_size
        
        for i in range(grid_size):
            for j in range(grid_size):
                cell = skeleton[i*cell_h:(i+1)*cell_h, j*cell_w:(j+1)*cell_w]
                density = np.sum(cell > 0) / (cell_h * cell_w)
                features.append(density)
        
        angles = np.linspace(0, 180, 8, endpoint=False)
        for angle in angles:
            kernel_size = 15
            sigma = 3
            theta = np.deg2rad(angle)
            kernel = cv2.getGaborKernel((kernel_size, kernel_size), sigma, theta, 10, 0.5)
            filtered = cv2.filter2D(skeleton.astype(np.float32), -1, kernel)
            response = np.sum(np.abs(filtered)) / (skeleton.size + 1e-7)
            features.append(response)
        
        lines = cv2.HoughLinesP(skeleton, 1, np.pi/180, threshold=20, 
                                minLineLength=15, maxLineGap=10)
        
        if lines is not None:
            lengths = [np.sqrt((x2-x1)**2 + (y2-y1)**2) for x1,y1,x2,y2 in lines[:, 0]]
            features.append(np.mean(lengths) / 100.0 if lengths else 0)
            features.append(len(lines) / 100.0)
            
            angles_hist = np.zeros(8)
            for x1, y1, x2, y2 in lines[:, 0]:
                angle = np.arctan2(y2-y1, x2-x1) * 180 / np.pi
                if angle < 0: angle += 180
                bin_idx = int(angle / 22.5) % 8
                angles_hist[bin_idx] += 1
            angles_hist = angles_hist / (len(lines) + 1e-7)
            features.extend(angles_hist.tolist())
        else:
            features.extend([0] * 10)
        
        cy, cx = h//2, w//2
        center_block = skeleton[cy-32:cy+32, cx-32:cx+32]
        if center_block.size > 0:
            features.append(np.std(center_block) / 255.0)
        else:
            features.append(0)
        
        return np.array(features)
    
    def extract_features(self, vein_image):
        if len(vein_image.shape) == 2:
            vein_rgb = cv2.cvtColor(vein_image, cv2.COLOR_GRAY2RGB)
        else:
            vein_rgb = vein_image
        
        resized_cnn = cv2.resize(vein_rgb, (224, 224))
        img_array = np.expand_dims(resized_cnn, axis=0)
        img_preprocessed = preprocess_input(img_array)
        
        cnn_features = self.model.predict(img_preprocessed, verbose=0)
        cnn_features = cnn_features.flatten()
        cnn_features = cnn_features / (np.linalg.norm(cnn_features) + 1e-7)
        
        if len(vein_image.shape) == 3:
            vein_gray = cv2.cvtColor(vein_image, cv2.COLOR_BGR2GRAY)
        else:
            vein_gray = vein_image
        
        _, vein_binary = cv2.threshold(vein_gray, 127, 255, cv2.THRESH_BINARY)
        handcrafted_features = self.extract_minutiae_features(vein_binary)
        
        if np.linalg.norm(handcrafted_features) > 0:
            handcrafted_features = handcrafted_features / np.linalg.norm(handcrafted_features)
        
        handcrafted_weighted = handcrafted_features * 2.0
        cnn_weighted = cnn_features * 0.5
        
        combined = np.concatenate([handcrafted_weighted, cnn_weighted])
        combined = combined / (np.linalg.norm(combined) + 1e-7)
        return combined

feature_extractor = VeinFeatureExtractor()

# ==================== Database ====================
def save_template(matric, name, features, vein_img, hand_side="Right"):
    student_folder = TEMPLATES_DIR / matric / hand_side
    student_folder.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S_%f")
    template_path = student_folder / f"features_{timestamp}.npy"
    image_path = student_folder / f"vein_{timestamp}.png"
    
    np.save(template_path, features)
    cv2.imwrite(str(image_path), vein_img)
    
    update_local_index(matric, name, hand_side, template_path)
    print(f"✓ Template saved: {template_path.name}")

def update_local_index(matric, name, hand_side, template_path):
    index_data = {}
    if INDEX_FILE.exists():
        with open(INDEX_FILE, 'r') as f:
            index_data = json.load(f)
    
    if matric not in index_data:
        index_data[matric] = {"name": name, "templates": []}
    
    index_data[matric]["templates"].append({
        "hand": hand_side,
        "path": str(template_path),
        "timestamp": datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    })
    
    with open(INDEX_FILE, 'w') as f:
        json.dump(index_data, f, indent=4)

def match_template(query_features):
    if not INDEX_FILE.exists():
        return None, 0.0
    
    best_match = None
    best_score = 0.0
    
    try:
        with open(INDEX_FILE, 'r') as f:
            index_data = json.load(f)
        
        for matric, info in index_data.items():
            for template in info['templates']:
                if os.path.exists(template['path']):
                    saved_features = np.load(template['path'])
                    similarity = np.dot(query_features, saved_features)
                    
                    if similarity > best_score:
                        best_score = similarity
                        best_match = {
                            "matric_no": matric,
                            "name": info['name']
                        }
    except Exception as e:
        print(f"Match Error: {e}")
    
    return best_match, best_score

# ==================== Quality Analyzer ====================
class HandQualityAnalyzer:
    def __init__(self):
        self.stability_buffer = deque(maxlen=10)
        self.area_buffer = deque(maxlen=10)
    
    def analyze_frame_quality(self, frame, contour):
        if contour is None or cv2.contourArea(contour) < 6000:
            return 0
        
        score = 0
        h, w = frame.shape[:2]
        
        area = cv2.contourArea(contour)
        area_ratio = area / (h * w)
        if 0.15 < area_ratio < 0.45:
            score += 35
        elif 0.10 < area_ratio < 0.50:
            score += 20
        
        x, y, cw, ch = cv2.boundingRect(contour)
        hand_cx = x + cw // 2
        hand_cy = y + ch // 2
        center_dist = np.sqrt((hand_cx - w//2)**2 + (hand_cy - h//2)**2)
        max_dist = np.sqrt((w//2)**2 + (h//2)**2)
        center_score = (1 - center_dist / max_dist) * 35
        score += center_score
        
        self.stability_buffer.append((hand_cx, hand_cy))
        self.area_buffer.append(area)
        
        if len(self.stability_buffer) >= 5:
            positions = np.array(self.stability_buffer)
            pos_variance = np.var(positions, axis=0).mean()
            if pos_variance < 100:
                score += 30
            elif pos_variance < 300:
                score += 15
        
        return min(score, 100)
    
    def should_capture(self, current_score):
        return current_score >= 85

# ==================== GUI ====================
class LiveVeinSystem:
    def __init__(self, root):
        self.root = root
        self.root.title("PalmPass - Exam Attendance")
        self.root.geometry("1400x900")
        self.root.configure(bg="#0a192f")
        
        self.mode = tk.StringVar(value="attendance")
        self.exam_subject = tk.StringVar(value="")
        self.live_active = False
        self.processing = False
        self.awaiting_name_input = False
        self.last_capture_time = 0
        self.capture_cooldown = CAPTURE_COOLDOWN
        
        # Registration state
        self.registration_mode_active = False
        self.current_registration_matric = None
        self.current_registration_name = None
        self.samples_collected = 0
        
        self.quality_analyzer = HandQualityAnalyzer()
        self.cap = None
        
        self.setup_ui()
        
        send_lcd_command("CLEAR")
        time.sleep(0.1)
        send_lcd_command("PalmPass")
        time.sleep(0.05)
        send_lcd_command("Initializing...")
        time.sleep(0.05)
        send_lcd_command("NO_CURSOR")
    
    def setup_ui(self):
        sidebar = tk.Frame(self.root, bg="#112240", width=320)
        sidebar.pack(side=tk.LEFT, fill=tk.Y, padx=10, pady=10)
        
        tk.Label(sidebar, text="🤚 Exam Attendance", font=("Arial", 16, "bold"),
                 bg="#112240", fg="#64ffda").pack(pady=20)
        
        # Mode Selection
        mode_frame = tk.LabelFrame(sidebar, text="Operation Mode", bg="#112240",
                                   fg="white", font=("Arial", 11, "bold"))
        mode_frame.pack(fill=tk.X, padx=15, pady=10)
        
        modes = [("📝 Registration", "registration"), ("✅ Exam Attendance", "attendance"), ("🚻 Bathroom Logging", "bathroom")]
        for text, val in modes:
            tk.Radiobutton(mode_frame, text=text, variable=self.mode, value=val,
                           bg="#112240", fg="white", selectcolor="#233554",
                           font=("Arial", 11), command=self.on_mode_change).pack(anchor=tk.W, padx=10, pady=5)
        
        # Exam Name Input
        self.exam_frame = tk.LabelFrame(sidebar, text="Exam Details", bg="#112240",
                                        fg="white", font=("Arial", 11, "bold"))
        self.exam_frame.pack(fill=tk.X, padx=15, pady=10)
        
        tk.Label(self.exam_frame, text="Exam Subject Code:", bg="#112240", fg="white").pack(anchor=tk.W, padx=10, pady=5)
        self.exam_combo = ttk.Combobox(self.exam_frame, textvariable=self.exam_subject, font=("Arial", 11), state="readonly")
        self.exam_combo.pack(fill=tk.X, padx=10, pady=5)
        
        exams = self.fetch_exams()
        self.exam_combo['values'] = exams
        if exams:
            self.exam_subject.set(exams[0])
        
        # Quality Meter
        self.quality_frame = tk.LabelFrame(sidebar, text="Hand Quality", bg="#112240", fg="white")
        self.quality_frame.pack(fill=tk.X, padx=15, pady=10)
        
        self.quality_bar = ttk.Progressbar(self.quality_frame, length=250, mode='determinate')
        self.quality_bar.pack(padx=10, pady=10)
        
        self.quality_label = tk.Label(self.quality_frame, text="0%", bg="#112240",
                                       fg="white", font=("Arial", 10))
        self.quality_label.pack()
        
        # Registration Progress
        self.registration_progress = tk.Label(sidebar, text="", bg="#112240", fg="#64ffda", font=("Arial", 11))
        
        # Controls
        self.btn_live = tk.Button(sidebar, text="▶ Start System", command=self.toggle_system,
                                  bg="#4caf50", fg="white", font=("Arial", 12, "bold"))
        self.btn_live.pack(fill=tk.X, padx=15, pady=20, ipady=5)
        
        self.status_lbl = tk.Label(sidebar, text="● System Offline", bg="#112240", fg="#8892b0",
                                   font=("Arial", 10), wraplength=280, justify=tk.LEFT)
        self.status_lbl.pack(side=tk.BOTTOM, pady=20)
        
        # Display Area
        display_frame = tk.Frame(self.root, bg="#0a192f")
        display_frame.pack(side=tk.RIGHT, fill=tk.BOTH, expand=True)
        
        self.img_label = tk.Label(display_frame, bg="black")
        self.img_label.pack(expand=True, fill=tk.BOTH, padx=20, pady=20)
        
        self.info_overlay = tk.Label(display_frame, text="Configure and press Start...",
                                     bg="#0a192f", fg="#64ffda", font=("Arial", 14, "bold"))
        self.info_overlay.pack(side=tk.BOTTOM, pady=20)
    
    def on_mode_change(self):
        if self.mode.get() in ["attendance", "bathroom"]:
            self.exam_frame.pack(fill=tk.X, padx=15, pady=10, before=self.quality_frame)
            self.registration_progress.pack_forget()
        else:
            self.exam_frame.pack_forget()
            self.registration_progress.pack(fill=tk.X, padx=15, pady=10, before=self.btn_live)
    
    def fetch_exams(self):
        if not db:
            return []
        try:
            exams = []
            docs = db.collection('EXAM').stream()
            for doc in docs:
                data = doc.to_dict()
                if 'exam_id' in data:
                    exams.append(data['exam_id'])
            return exams
        except Exception as e:
            print(f"Error fetching exams: {e}")
            return []
    
    def toggle_system(self):
        if self.live_active:
            self.stop_system()
        else:
            self.start_system()
    
    def start_system(self):
        if self.mode.get() in ["attendance", "bathroom"] and not self.exam_subject.get().strip():
            messagebox.showerror("Error", "Please enter exam subject code!")
            return
        
        self.live_active = True
        self.btn_live.config(text="⏹ Stop System", bg="#f44336")
        self.update_status("🟢 System Active")
        
        if self.mode.get() == "registration":
            self.registration_progress.config(text="Ready for Sample 1/3")
        
        send_lcd_command("CLEAR")
        time.sleep(0.1)
        send_lcd_command("System Ready")
        time.sleep(0.05)
        send_lcd_command("Show your palm")
        
        threading.Thread(target=self.live_loop, daemon=True).start()
    
    def stop_system(self):
        self.live_active = False
        self.registration_mode_active = False
        self.samples_collected = 0
        self.awaiting_name_input = False
        self.registration_progress.config(text="")
        
        if self.cap:
            self.cap.release()
            self.cap = None
        
        self.btn_live.config(text="▶ Start System", bg="#4caf50")
        self.update_status("● System Offline")
        self.img_label.config(image='')
        self.update_info("Configure and press Start...")
        send_lcd_command("CLEAR")
    
    def live_loop(self):
        self.cap = cv2.VideoCapture(STREAM_URL_PRIMARY)
        if not self.cap.isOpened():
            self.cap = cv2.VideoCapture(STREAM_URL_BACKUP)
        
        if not self.cap.isOpened():
            self.root.after(0, lambda: messagebox.showerror("Error", "Camera not found"))
            self.live_active = False
            return
        
        # Clear buffer
        for _ in range(5):
            self.cap.grab()
        
        print("Live feed started")
        self.update_info("Show your hand...")
        
        stream_retries = 0
        max_retries = 3
        
        while self.live_active:
            if self.processing or self.awaiting_name_input:
                time.sleep(0.1)
                continue
            
            ret, frame = self.cap.read()
            if not ret:
                if stream_retries < max_retries:
                    print(f"Stream ended prematurely, retrying... ({stream_retries + 1}/{max_retries})")
                    self.cap.release()
                    time.sleep(1)
                    self.cap = cv2.VideoCapture(STREAM_URL_PRIMARY)
                    if not self.cap.isOpened():
                        self.cap = cv2.VideoCapture(STREAM_URL_BACKUP)
                    if self.cap.isOpened():
                        for _ in range(5):
                            self.cap.grab()
                        stream_retries = 0  # reset on success
                    else:
                        stream_retries += 1
                    continue
                else:
                    print("Stream failed after retries, stopping live feed")
                    break
            
            display_frame = frame.copy()
            h_frame, w_frame = frame.shape[:2]
            
            display_frame = frame.copy()
            h_frame, w_frame = frame.shape[:2]
            
            blurred = cv2.GaussianBlur(frame, (21, 21), 0)
            gray = cv2.cvtColor(blurred, cv2.COLOR_BGR2GRAY)
            _, thresh = cv2.threshold(gray, 100, 255, cv2.THRESH_BINARY)
            contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            hand_contour = None
            if contours:
                c = max(contours, key=cv2.contourArea)
                if cv2.contourArea(c) > 6000:
                    hand_contour = c
            
            quality_score = self.quality_analyzer.analyze_frame_quality(frame, hand_contour)
            self.update_quality_display(quality_score)
            
            current_time = time.time()
            time_since_last = current_time - self.last_capture_time
            
            if hand_contour is not None:
                x, y, w, h = cv2.boundingRect(hand_contour)
                
                if quality_score >= 85:
                    color = (0, 255, 0)
                    status = "READY TO CAPTURE"
                elif quality_score >= 60:
                    color = (0, 255, 255)
                    status = "HOLD STEADY..."
                else:
                    color = (0, 165, 255)
                    status = "ADJUST POSITION"
                
                cv2.rectangle(display_frame, (x, y), (x+w, y+h), color, 3)
                hand_cx = x + w // 2
                hand_cy = y + h // 2
                cv2.drawMarker(display_frame, (hand_cx, hand_cy), color,
                              cv2.MARKER_CROSS, 30, 3)
                
                if self.quality_analyzer.should_capture(quality_score):
                    if time_since_last > self.capture_cooldown:
                        self.processing = True
                        self.last_capture_time = current_time
                        
                        cv2.putText(display_frame, "📸 CAPTURING!", (w_frame//2 - 150, 60),
                                   cv2.FONT_HERSHEY_SIMPLEX, 1.5, (0, 255, 0), 4)
                        self.update_display(display_frame)
                        
                        threading.Thread(target=self.process_capture, daemon=True).start()
                    else:
                        remaining = int(self.capture_cooldown - time_since_last)
                        cv2.putText(display_frame, f"Wait {remaining}s", (10, 50),
                                   cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 0), 2)
                
                cv2.putText(display_frame, status, (10, h_frame - 20),
                           cv2.FONT_HERSHEY_SIMPLEX, 0.8, color, 2)
            else:
                cv2.putText(display_frame, "NO HAND DETECTED", (10, 50),
                           cv2.FONT_HERSHEY_SIMPLEX, 1.0, (0, 0, 255), 2)
            
            cv2.putText(display_frame, f"Quality: {int(quality_score)}%", (10, h_frame - 60),
                       cv2.FONT_HERSHEY_SIMPLEX, 0.7, (255, 255, 255), 2)
            
            self.update_display(display_frame)
        
        if self.cap:
            self.cap.release()
            self.cap = None
        print("Live feed stopped")
    
    def process_capture(self):
        try:
            send_lcd_command("CAPTURING")
            self.update_status("📷 Capturing...")
            
            resp = requests.get(f"{CAPTURE_URL}?size={CAPTURE_SIZE}", timeout=5)
            hd_img = cv2.imdecode(np.frombuffer(resp.content, np.uint8), cv2.IMREAD_COLOR)
            
            if hd_img is None:
                raise Exception("Capture failed")
            
            self.update_status("🔍 Processing...")
            send_lcd_command("PROCESSING")
            
            vein_img, features = self.extract_vein_features(hd_img)
            
            if features is None:
                send_lcd_command("NO_MATCH")
                time.sleep(2)
                self.reset_to_ready()
                return
            
            mode = self.mode.get()
            if mode == "registration":
                self.handle_registration(features, vein_img)
            elif mode == "bathroom":
                self.handle_bathroom(features, vein_img)
            else:
                self.handle_attendance(features, vein_img)
        
        except Exception as e:
            print(f"Error: {e}")
            send_lcd_command("NO_MATCH")
            time.sleep(2)
            self.reset_to_ready()
    
    def extract_vein_features(self, img):
        try:
            if len(img.shape) == 2:
                gray = img
            else:
                gray = img[:, :, 2]
            
            denoised = cv2.bilateralFilter(gray, 9, 80, 80)
            
            _, mask = cv2.threshold(denoised, 45, 255, cv2.THRESH_BINARY)
            kernel = np.ones((5,5), np.uint8)
            mask = cv2.morphologyEx(mask, cv2.MORPH_OPEN, kernel)
            mask = cv2.morphologyEx(mask, cv2.MORPH_CLOSE, kernel)
            
            contours, _ = cv2.findContours(mask, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            if not contours:
                return None, None
            
            c = max(contours, key=cv2.contourArea)
            
            if len(c) > 5:
                (x, y), (MA, ma), angle = cv2.fitEllipse(c)
                rotation_angle = angle - 180 if angle > 90 else angle
                
                if abs(rotation_angle) < 30:
                    h, w = denoised.shape[:2]
                    M = cv2.getRotationMatrix2D((x, y), rotation_angle, 1.0)
                    denoised = cv2.warpAffine(denoised, M, (w, h), flags=cv2.INTER_CUBIC)
            
            mask_final = np.zeros_like(mask)
            cv2.drawContours(mask_final, [c], -1, 255, -1)
            bg_removed = cv2.bitwise_and(denoised, denoised, mask=mask_final)
            
            x, y, w, h = cv2.boundingRect(c)
            m = 20
            roi = bg_removed[max(0, y-m):min(denoised.shape[0], y+h+m),
                            max(0, x-m):min(denoised.shape[1], x+w+m)]
            roi = cv2.resize(roi, (512, 512))
            
            clahe = cv2.createCLAHE(clipLimit=3.0, tileGridSize=(8,8))
            enhanced = clahe.apply(roi)
            
            kernel_size = 15
            kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (kernel_size, kernel_size))
            blackhat = cv2.morphologyEx(enhanced, cv2.MORPH_BLACKHAT, kernel)
            blackhat_norm = cv2.normalize(blackhat, None, 0, 255, cv2.NORM_MINMAX)
            blurred = cv2.GaussianBlur(blackhat_norm, (3, 3), 0)
            
            blurred_adaptive = cv2.GaussianBlur(blurred, (5, 5), 0)
            binary = cv2.adaptiveThreshold(blurred_adaptive, 255, cv2.ADAPTIVE_THRESH_GAUSSIAN_C,
                                          cv2.THRESH_BINARY, 25, -4)
            
            kernel_open = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (3,3))
            binary = cv2.morphologyEx(binary, cv2.MORPH_OPEN, kernel_open)
            
            kernel_close = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (5 , 5))
            closed = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel_close)
            
            bool_img = closed > 0
            cleaned = remove_small_objects(bool_img, max_size=99)
            final_vein = (cleaned * 255).astype(np.uint8)
            
            features = feature_extractor.extract_features(final_vein)
            return final_vein, features
        
        except Exception as e:
            print(f"Extraction Error: {e}")
            return None, None
    
    def handle_registration(self, features, vein_img):
        # 1. Get user details if this is the very first sample
        if not hasattr(self, 'registration_mode_active') or not self.registration_mode_active:
            self.awaiting_name_input = True
            details = self.get_registration_details()
            self.awaiting_name_input = False
            if not details:
                self.reset_to_ready()
                return
            name, matric, faculty, program = details
            
            self.current_registration_name = name
            self.current_registration_matric = matric
            self.current_registration_faculty = faculty
            self.current_registration_program = program
            if INDEX_FILE.exists():
                with open(INDEX_FILE, 'r') as f:
                    index_data = json.load(f)
                if matric in index_data:
                    send_lcd_command("ALREADY REG")
                    self.update_info(f"❌ ALREADY REGISTERED\n{matric}", fg="#ff3333")
                    messagebox.showerror("Duplicate", f"Matric {matric} is already registered!")
                    self.reset_to_ready()
                    return
            else:
                index_data = {}
            
            self.registration_mode_active = True
            self.samples_collected = 0
            self.registration_progress.config(text="Collecting Sample 1/3")

        # 3. Show Confirmation Popup with the Vein Image
        self.show_sample_confirmation(features, vein_img)

    def show_sample_confirmation(self, features, vein_img):
        """Creates a popup to show the vein pattern before saving"""
        self.awaiting_name_input = True # Pause the live loop
        
        confirm_win = tk.Toplevel(self.root)
        confirm_win.title(f"Sample {self.samples_collected + 1} Confirmation")
        confirm_win.geometry("400x500")
        confirm_win.configure(bg="#112240")
        confirm_win.grab_set() # Force focus

        tk.Label(confirm_win, text=f"Confirm Sample {self.samples_collected + 1}/3", 
                 bg="#112240", fg="#64ffda", font=("Arial", 12, "bold")).pack(pady=10)

        # Convert OpenCV image (vein_img) to PIL format for Tkinter
        img_resized = cv2.resize(vein_img, (300, 300))
        img_pil = Image.fromarray(img_resized)
        img_tk = ImageTk.PhotoImage(image=img_pil)
        
        img_label = tk.Label(confirm_win, image=img_tk, bg="black")
        img_label.image = img_tk # Keep reference
        img_label.pack(pady=10)

        def on_confirm():
            self.awaiting_name_input = False
            self.save_confirmed_sample(features, vein_img)
            confirm_win.destroy()
            self.check_registration_completion()

        def on_retake():
            self.awaiting_name_input = False
            confirm_win.destroy()
            self.update_info("Sample discarded. Retaking...")
            # Brief delay before allowing next capture to let user adjust
            self.root.after(1000, self.reset_to_ready)

        btn_frame = tk.Frame(confirm_win, bg="#112240")
        btn_frame.pack(pady=20)

        tk.Button(btn_frame, text="✅ CONFIRM & SAVE", command=on_confirm, 
                  bg="#4caf50", fg="white", width=15).pack(side=tk.LEFT, padx=10)
        tk.Button(btn_frame, text="❌ RETAKE", command=on_retake, 
                  bg="#f44336", fg="white", width=15).pack(side=tk.LEFT, padx=10)

    def save_confirmed_sample(self, features, vein_img):
        """Helper to save to local storage"""
        save_template(self.current_registration_matric, self.current_registration_name,
                     features, vein_img)
        self.samples_collected += 1
        send_lcd_command(f"Sample {self.samples_collected}/3")
        self.registration_progress.config(text=f"Sample {self.samples_collected}/3 Saved")
        print(f"Sample {self.samples_collected} saved locally.")

    def get_registration_details(self):
        """Custom dialog to get name and matric number"""
        dialog = tk.Toplevel(self.root)
        dialog.title("Student Registration")
        dialog.geometry("500x400")  # Bigger size for longer inputs
        dialog.configure(bg="#112240")
        dialog.resizable(False, False)
        dialog.transient(self.root)
        dialog.grab_set()

        tk.Label(dialog, text="Enter Student Details", bg="#112240", fg="#64ffda", 
                 font=("Arial", 14, "bold")).pack(pady=10)

        # Name field
        tk.Label(dialog, text="Full Name:", bg="#112240", fg="white", 
                 font=("Arial", 11)).pack(anchor=tk.W, padx=20)
        name_var = tk.StringVar()
        name_entry = tk.Entry(dialog, textvariable=name_var, font=("Arial", 12), width=40)
        name_entry.pack(pady=5, padx=20)
        name_entry.focus()
        
        def to_upper_name(*args):
            name_var.set(name_var.get().upper())
        name_var.trace_add("write", to_upper_name)

        # Matric field
        tk.Label(dialog, text="Matric Number:", bg="#112240", fg="white", 
                 font=("Arial", 11)).pack(anchor=tk.W, padx=20)
        matric_var = tk.StringVar()
        matric_entry = tk.Entry(dialog, textvariable=matric_var, font=("Arial", 12), width=40)
        matric_entry.pack(pady=5, padx=20)
        
        def to_upper_matric(*args):
            matric_var.set(matric_var.get().upper())
        matric_var.trace_add("write", to_upper_matric)

        # Faculty field
        tk.Label(dialog, text="Faculty:", bg="#112240", fg="white", 
                 font=("Arial", 11)).pack(anchor=tk.W, padx=20)
        faculty_var = tk.StringVar()
        faculty_combo = ttk.Combobox(dialog, textvariable=faculty_var, values=[f['code'] for f in FACULTY_DATA], state="readonly", font=("Arial", 12), width=37)
        faculty_combo.pack(pady=5, padx=20)

        # Program field
        tk.Label(dialog, text="Program:", bg="#112240", fg="white", 
                 font=("Arial", 11)).pack(anchor=tk.W, padx=20)
        program_var = tk.StringVar()
        program_combo = ttk.Combobox(dialog, textvariable=program_var, state="readonly", font=("Arial", 12), width=37)
        program_combo.pack(pady=5, padx=20)

        def on_faculty_change(*args):
            selected = faculty_var.get()
            if selected:
                for f in FACULTY_DATA:
                    if f['code'] == selected:
                        program_combo['values'] = f['programs']
                        program_var.set('')
                        break

        faculty_var.trace_add("write", on_faculty_change)

        result = [None, None, None, None]

        def on_ok():
            name = name_var.get().strip()
            matric = matric_var.get().strip()
            faculty = faculty_var.get()
            program = program_var.get()
            if len(matric) != 10:
                messagebox.showwarning("Invalid Matric", "Matric number must be exactly 10 characters!")
                return
            if not all([name, matric, faculty, program]):
                messagebox.showwarning("Incomplete", "Please fill all fields!")
                return
            result[0] = name
            result[1] = matric
            result[2] = faculty
            result[3] = program
            dialog.destroy()

        def on_cancel():
            dialog.destroy()

        btn_frame = tk.Frame(dialog, bg="#112240")
        btn_frame.pack(pady=20)

        tk.Button(btn_frame, text="OK", command=on_ok, bg="#4caf50", fg="white", 
                  width=10, font=("Arial", 11)).pack(side=tk.LEFT, padx=10)
        tk.Button(btn_frame, text="Cancel", command=on_cancel, bg="#f44336", fg="white", 
                  width=10, font=("Arial", 11)).pack(side=tk.LEFT, padx=10)

        self.root.wait_window(dialog)
        return result if result[0] and result[1] else None

    def check_registration_completion(self):
        """Checks if we have enough samples to update Firebase"""
        if self.samples_collected >= 3: # Changed to 3 based on your request
            try:
                student_ref = db.collection('STUDENT').document(self.current_registration_matric)
                student_ref.set({
                    'name': self.current_registration_name,
                    'matric_no': self.current_registration_matric,
                    'program': self.current_registration_program.split(' - ')[0],
                    'palm_registered': firestore.SERVER_TIMESTAMP,
                    'total_samples': self.samples_collected
                }, merge=True)
                
                send_lcd_command("REGISTERED OK")
                self.registration_progress.config(text="Registration Complete")
                messagebox.showinfo("Success", f"Registration Complete for {self.current_registration_name}")
                
                self.registration_mode_active = False
                self.samples_collected = 0
                self.reset_to_ready()
            except Exception as e:
                messagebox.showerror("Firebase Error", str(e))
                self.reset_to_ready()
        else:
            # Delay before next capture to prevent immediate double-triggering
            self.update_info(f"Saved. Please adjust hand for sample {self.samples_collected + 1}")
            self.root.after(2000, self.reset_to_ready)
    
    def handle_attendance(self, features, vein_img):
        match, score = match_template(features)
        
        if match and score >= MATCH_THRESHOLD:
            matric_no = match.get('matric_no', 'UNKNOWN')
            exam = self.exam_subject.get().strip()
            
            result = update_firebase_attendance(matric_no, exam)
            
            if result == "ALREADY_MARKED":
                send_lcd_command("CLEAR")
                time.sleep(0.1)
                send_lcd_command("ALREADY MARKED")
                time.sleep(0.1)
                send_lcd_command("PRESENT")
                
                self.update_info(f"ℹ {match['name']}\nAlready Marked", fg="#ffaa00")
                time.sleep(3)
                self.reset_to_ready()
            
            elif result:
                send_lcd_command(f"MATCH_FOUND:{match['name']}")
                time.sleep(1.5)
                send_lcd_command(f"ID:{matric_no}")
                time.sleep(0.05)
                send_lcd_command(f"Table No: {result}")
                
                self.update_info(f"✅ {match['name']}\nTable {result}", fg="#00ff00")
                time.sleep(3)
                self.reset_to_ready()
            
            else:
                send_lcd_command("NO_MATCH")
                self.update_info(f"❌ Not Found in {exam}", fg="#ff3333")
                messagebox.showwarning("Error", f"{matric_no} not in {exam}")
                self.reset_to_ready()
        
        else:
            send_lcd_command("NO_MATCH")
            self.update_info("❌ ACCESS DENIED", fg="#ff3333")
            time.sleep(2)
            self.reset_to_ready()
    
    def handle_bathroom(self, features, vein_img):
        match, score = match_template(features)
        print(f"Bathroom match score: {score}")
        
        if match and score >= MATCH_THRESHOLD:
            matric_no = match.get('matric_no', 'UNKNOWN')
            exam = self.exam_subject.get().strip()
            attendance_id = f"{exam}_{matric_no}"
            print(f"Exam: '{exam}', Matric: '{matric_no}', Attendance ID: '{attendance_id}'")
            
            result = update_bathroom_log(attendance_id)
            
            if result == "RETURNED":
                send_lcd_command("RETURNED")
                self.update_info(f"✅ {match['name']}\nReturned", fg="#00ff00")
                time.sleep(3)
                self.reset_to_ready()
            
            elif result == "OUT":
                send_lcd_command("OUT")
                self.update_info(f"🚻 {match['name']}\nBathroom Break", fg="#ffa500")
                time.sleep(3)
                self.reset_to_ready()
            
            else:
                send_lcd_command("NO_MATCH")
                self.update_info("❌ Error", fg="#ff3333")
                self.reset_to_ready()
        
        else:
            send_lcd_command("NO_MATCH")
            self.update_info("❌ ACCESS DENIED", fg="#ff3333")
            time.sleep(2)
            self.reset_to_ready()
    
    def reset_to_ready(self):
        # Clear camera buffer
        if self.cap:
            for _ in range(10):
                self.cap.grab()
        
        self.processing = False
        self.update_info("Show your hand...")
        self.update_status("🟢 System Active")
        
        send_lcd_command("CLEAR")
        time.sleep(0.1)
        send_lcd_command("System Ready")
        time.sleep(0.05)
        send_lcd_command("Show your palm")
    
    def update_display(self, img):
        h, w = img.shape[:2]
        scale = min(1000/w, 600/h)
        resized = cv2.resize(img, (int(w*scale), int(h*scale)))
        
        if len(resized.shape) == 2:
            rgb = cv2.cvtColor(resized, cv2.COLOR_GRAY2RGB)
        else:
            rgb = cv2.cvtColor(resized, cv2.COLOR_BGR2RGB)
        
        img_tk = ImageTk.PhotoImage(Image.fromarray(rgb))
        
        def update():
            self.img_label.config(image=img_tk)
            self.img_label.image = img_tk
        self.root.after(0, update)
    
    def update_status(self, txt):
        self.root.after(0, lambda: self.status_lbl.config(text=txt))
    
    def update_info(self, txt, fg="#64ffda"):
        self.root.after(0, lambda: self.info_overlay.config(text=txt, fg=fg))
    
    def update_quality_display(self, quality):
        def update():
            self.quality_bar['value'] = quality
            self.quality_label.config(text=f"{int(quality)}%")
            
            if quality >= 85:
                self.quality_label.config(fg="#00ff00")
            elif quality >= 60:
                self.quality_label.config(fg="#ffaa00")
            else:
                self.quality_label.config(fg="#ff6666")
        
        self.root.after(0, update)

if __name__ == "__main__":
    if not init_firebase():
        print("⚠ Firebase not connected")
    
    if init_serial():
        print("✓ LCD connected")
    else:
        print("⚠ LCD not connected")
    
    root = tk.Tk()
    app = LiveVeinSystem(root)
    root.mainloop()
    
    if ser and ser.is_open:
        ser.close()