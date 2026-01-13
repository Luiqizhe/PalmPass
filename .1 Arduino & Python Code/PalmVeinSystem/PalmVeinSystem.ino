#include <Wire.h>
#include <LiquidCrystal_I2C.h>

#define SDA_PIN 20
#define SCL_PIN 21
#define MOSFET_PIN 45

// LCD address (Change to 0x3F if 0x27 doesn't work)
LiquidCrystal_I2C lcd(0x27, 16, 2);

void setup() {
  Serial.begin(115200);

  // Initialize I2C for LCD
  Wire.begin(SDA_PIN, SCL_PIN);
  Wire.setClock(100000);

  // Initialize LCD
  lcd.init();
  lcd.backlight();

  // MOSFET/IR LED control
  pinMode(MOSFET_PIN, OUTPUT);
  ledcAttach(MOSFET_PIN, 5000, 8); 
  ledcWrite(MOSFET_PIN, 50); 

  // Initial State
  displayScreen("PALMPASS", "WAITING...");
}

// ==========================================
//  UPDATED DISPLAY FUNCTION
//  1. Clears screen first (fixes overriding)
//  2. Centers ALL text automatically
// ==========================================
void displayScreen(String line1, String line2) {
  lcd.clear(); // CLEAR SCREEN to remove old text

  // --- Process Line 1 ---
  line1.trim(); // Remove extra spaces
  if (line1.length() > 16) line1 = line1.substring(0, 16); // Clip to 16 chars
  int padding1 = (16 - line1.length()) / 2; // Calculate center
  lcd.setCursor(padding1, 0);
  lcd.print(line1);

  // --- Process Line 2 ---
  line2.trim();
  if (line2.length() > 16) line2 = line2.substring(0, 16); // Clip to 16 chars
  int padding2 = (16 - line2.length()) / 2; // Calculate center
  lcd.setCursor(padding2, 1);
  lcd.print(line2);
}

void handleSerialCommand() {
  if (Serial.available() > 0) {
    String input = Serial.readStringUntil('\n');
    input.trim();

    // Split Command and Data (Format: COMMAND:DATA)
    int separatorIndex = input.indexOf(':');
    String cmd = (separatorIndex == -1) ? input : input.substring(0, separatorIndex);
    String data = (separatorIndex == -1) ? "" : input.substring(separatorIndex + 1);

    // --- HARDWARE CONTROL ---
    if (cmd == "IR_ON") { ledcWrite(MOSFET_PIN, 255); return; }
    if (cmd == "IR_OFF") { ledcWrite(MOSFET_PIN, 0); return; }
    
    // --- DISPLAY LOGIC ---
    
    // 1. IDLE
    if (cmd == "IDLE") {
      displayScreen("PALMPASS", "WAITING...");
    }
    
    // 2. NO MATCH
    else if (cmd == "NOMATCH") {
      displayScreen("NO MATCH", "FOUND");
    }
    
    // 3. ATTENDANCE SUCCESS (Format: ATTENDANCE:Matric|Table)
    else if (cmd == "ATTENDANCE") {
      int split = data.indexOf('|');
      if (split != -1) {
        String matric = data.substring(0, split);
        String table = data.substring(split + 1);
        displayScreen("ID: " + matric, "TABLE: " + table);
      }
    }
    
    // 4. BATHROOM OUT (Format: BATH_OUT:Matric|Time)
    else if (cmd == "BATH_OUT") {
      int split = data.indexOf('|');
      if (split != -1) {
        String matric = data.substring(0, split);
        String timeStr = data.substring(split + 1);
        displayScreen("ID: " + matric, "OUT: " + timeStr);
      }
    }

    // 5. BATHROOM IN (Format: BATH_IN:Matric|Time)
    else if (cmd == "BATH_IN") {
      int split = data.indexOf('|');
      if (split != -1) {
        String matric = data.substring(0, split);
        String timeStr = data.substring(split + 1);
        displayScreen("ID: " + matric, "IN: " + timeStr);
      }
    }

    // 6. REGISTRATION SUCCESS (Format: REGISTERED:Matric)
    else if (cmd == "REGISTERED") {
      displayScreen("ID: " + data, "REGISTERED");
    }

    // 7. ERRORS / DUPLICATES
    else if (cmd == "ERR_VEIN") {
      displayScreen("VEIN PATTERN", "ALREADY REG.");
    }
    else if (cmd == "ERR_SCAN") {
      displayScreen("STUDENT ALREADY", "SCANNED");
    }
    else if (cmd == "PROCESSING") {
      displayScreen("PROCESSING", "PLEASE WAIT...");
    }
  }
}

void loop() {
  handleSerialCommand();
  delay(10);
}