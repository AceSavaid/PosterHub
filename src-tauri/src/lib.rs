// The desktop app is the same web app in a native window. These plugins give
// it a folder on disk for the poster library (fs), native Save dialogs for
// exports (dialog), and "Show folder" (opener).
#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .run(tauri::generate_context!())
        .expect("error while running PosterHub");
}
