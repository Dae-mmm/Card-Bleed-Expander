// Hide the console window on Windows release builds.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// The app is the same web frontend as the Vercel site, served from the bundle.
// No Rust commands are needed: image processing runs in the WebView.
fn main() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("error while running Card Bleed Expander");
}
