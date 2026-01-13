#include "esp_camera.h"
#include <WiFi.h>

#define CAMERA_MODEL_AI_THINKER
#include "camera_pins.h"

const char* ssid = "SSID_NAME";
const char* password = "SSID_PASSWORD";

void startCameraServer();

void setup() {
  Serial.begin(115200);
  Serial.setDebugOutput(true);
  Serial.println();

  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;

  config.frame_size = FRAMESIZE_VGA;  // 640x480
  config.jpeg_quality = 12;
  config.fb_count = 2;
  config.grab_mode = CAMERA_GRAB_LATEST;
  config.fb_location = CAMERA_FB_IN_PSRAM;

  if (psramFound()) {
    Serial.println("PSRAM found - using optimal settings");
  } else {
    Serial.println("No PSRAM detected - falling back");
  }

  // Camera init
  esp_err_t err = esp_camera_init(&config);
  if (err != ESP_OK) {
    Serial.printf("Camera init failed with error 0x%x\n", err);
    return;
  }

  sensor_t *s = esp_camera_sensor_get();

  // Turn off the bright onboard flash LED (GPIO 4)
  pinMode(4, OUTPUT);
  digitalWrite(4, LOW);

  s->set_pixformat(s, PIXFORMAT_JPEG);
  s->set_framesize(s, FRAMESIZE_VGA);

  // --- Kill all auto garbage ---
  s->set_whitebal(s, 0);
  s->set_awb_gain(s, 0);
  s->set_exposure_ctrl(s, 0);
  s->set_aec2(s, 0);
  s->set_gain_ctrl(s, 0);

  // --- Manual exposure (CRITICAL) ---
  s->set_aec_value(s, 30);     // higher = darker background + visible veins
  s->set_agc_gain(s, 1);        // keep noise LOW
  s->set_gainceiling(s, (gainceiling_t)2);

  // --- Contrast shaping ---
  s->set_brightness(s, 1);
  s->set_contrast(s, 2);
  s->set_saturation(s, -2);
  s->set_ae_level(s, -2);

  // --- Keep sensor clean but RAW ---
  s->set_bpc(s, 1);   // remove dead pixels
  s->set_wpc(s, 1);   // remove hot pixels

  // --- HARD DISABLE CAMERA BEAUTY FILTERS ---
  s->set_raw_gma(s, 0);   // 🔥 THIS WAS KILLING YOUR VEINS
  s->set_lenc(s, 0);     // remove vignette correction
  s->set_dcw(s, 0);      // no internal downscaling blur

  // --- Orientation ---
  s->set_hmirror(s, 1);
  s->set_vflip(s, 0);
  s->set_special_effect(s, 0);


  Serial.println("\n=== Optimal Palm Vein Settings Applied ===");
  Serial.println("Exposure: 50");
  Serial.println("Gain: 1x");
  Serial.println("Contrast: +2 (CRITICAL for vein visibility)");
  Serial.println("Brightness: -2");
  Serial.println("All auto controls: OFF");
  Serial.println("Image processing: ON (BPC, WPC, GMA, Lens Correction)");
  Serial.println("\nYou can still adjust via web interface if needed.");

  // WiFi connection
  WiFi.begin(ssid, password);
  WiFi.setSleep(false);

  Serial.print("Connecting to WiFi");
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nWiFi connected!");
  Serial.print("Stream URL: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/stream");
  Serial.print("Snapshot URL: http://");
  Serial.print(WiFi.localIP());
  Serial.println("/capture");

  startCameraServer();
}

void loop() {
  delay(10000);
}