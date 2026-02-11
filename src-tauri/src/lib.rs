use std::sync::{Arc, Mutex};

use tauri::menu::{Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, Runtime, State, WebviewUrl, WebviewWindowBuilder, WindowEvent};
use tauri_plugin_global_shortcut::{Shortcut, ShortcutState};

const TRAY_ID: &str = "lexi-tray";
const TRAY_SHOW_ID: &str = "tray_show";
const TRAY_QUICK_DEFINE_ID: &str = "tray_quick_define";
const TRAY_QUICK_TRANSLATE_ID: &str = "tray_quick_translate";
const TRAY_QUIT_ID: &str = "tray_quit";

const MAIN_WINDOW_LABEL: &str = "main";
const QUICK_DEFINE_WINDOW_LABEL: &str = "quick-define";
const QUICK_TRANSLATE_WINDOW_LABEL: &str = "quick-translate";

const GLOBAL_DEFINE_SHORTCUT: &str = "CmdOrCtrl+Alt+D";
const GLOBAL_TRANSLATE_SHORTCUT: &str = "CmdOrCtrl+Alt+T";

#[derive(Default)]
struct AppState {
    hide_to_tray: Arc<Mutex<bool>>,
}

fn should_hide_to_tray(state: &State<'_, AppState>) -> bool {
    state.hide_to_tray.lock().map(|flag| *flag).unwrap_or(false)
}

fn show_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
    }
    Ok(())
}

fn hide_main_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(MAIN_WINDOW_LABEL) {
        window.hide()?;
    }
    Ok(())
}

fn show_quick_window<R: Runtime>(
    app: &AppHandle<R>,
    label: &str,
    mode: &str,
    title: &str,
) -> tauri::Result<()> {
    if let Some(window) = app.get_webview_window(label) {
        window.show()?;
        window.unminimize()?;
        window.set_focus()?;
        return Ok(());
    }

    let url = format!("index.html?quick={mode}");
    let window = WebviewWindowBuilder::new(app, label, WebviewUrl::App(url.into()))
        .title(title)
        .center()
        .inner_size(560.0, 460.0)
        .resizable(false)
        .maximizable(false)
        .minimizable(false)
        .decorations(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .build()?;

    window.set_focus()?;
    Ok(())
}

fn open_quick_define_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    show_quick_window(app, QUICK_DEFINE_WINDOW_LABEL, "define", "Define New Term")
}

fn open_quick_translate_window<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    show_quick_window(
        app,
        QUICK_TRANSLATE_WINDOW_LABEL,
        "translate",
        "Translate New Term",
    )
}

fn build_tray<R: Runtime>(app: &AppHandle<R>) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, TRAY_SHOW_ID, "Show Lexi", true, None::<&str>)?;
    let quick_define_item = MenuItem::with_id(
        app,
        TRAY_QUICK_DEFINE_ID,
        "Quick Define (Ctrl+Alt+D)",
        true,
        None::<&str>,
    )?;
    let quick_translate_item = MenuItem::with_id(
        app,
        TRAY_QUICK_TRANSLATE_ID,
        "Quick Translate (Ctrl+Alt+T)",
        true,
        None::<&str>,
    )?;
    let quit_item = MenuItem::with_id(app, TRAY_QUIT_ID, "Quit Lexi", true, None::<&str>)?;
    let separator = PredefinedMenuItem::separator(app)?;

    let menu = Menu::with_items(
        app,
        &[
            &show_item,
            &quick_define_item,
            &quick_translate_item,
            &separator,
            &quit_item,
        ],
    )?;

    let mut builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .show_menu_on_left_click(true)
        .tooltip("Lexi")
        .on_menu_event(|app, event| match event.id().as_ref() {
            TRAY_SHOW_ID => {
                let _ = show_main_window(app);
            }
            TRAY_QUICK_DEFINE_ID => {
                let _ = open_quick_define_window(app);
            }
            TRAY_QUICK_TRANSLATE_ID => {
                let _ = open_quick_translate_window(app);
            }
            TRAY_QUIT_ID => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button,
                button_state,
                ..
            } = event
            {
                if button == MouseButton::Left && button_state == MouseButtonState::Up {
                    let _ = show_main_window(tray.app_handle());
                }
            }
        });

    if let Some(icon) = app.default_window_icon() {
        builder = builder.icon(icon.clone());
    }

    let _ = builder.build(app)?;
    Ok(())
}

// Learn more about Tauri commands at https://tauri.app/develop/calling-rust/
#[tauri::command]
fn greet(name: &str) -> String {
    format!("Hello, {}! You've been greeted from Rust!", name)
}

#[tauri::command]
fn set_hide_to_tray(state: State<'_, AppState>, enabled: bool) {
    if let Ok(mut hide_to_tray) = state.hide_to_tray.lock() {
        *hide_to_tray = enabled;
    }
}

#[tauri::command]
fn hide_to_tray(app: AppHandle) -> Result<(), String> {
    hide_main_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn show_main_window_command(app: AppHandle) -> Result<(), String> {
    show_main_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_quick_define(app: AppHandle) -> Result<(), String> {
    open_quick_define_window(&app).map_err(|error| error.to_string())
}

#[tauri::command]
fn open_quick_translate(app: AppHandle) -> Result<(), String> {
    open_quick_translate_window(&app).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let define_shortcut = GLOBAL_DEFINE_SHORTCUT
        .parse::<Shortcut>()
        .expect("invalid define shortcut");
    let translate_shortcut = GLOBAL_TRANSLATE_SHORTCUT
        .parse::<Shortcut>()
        .expect("invalid translate shortcut");

    let define_shortcut_id = define_shortcut.id();
    let translate_shortcut_id = translate_shortcut.id();

    let global_shortcut_plugin = tauri_plugin_global_shortcut::Builder::new()
        .with_shortcuts([define_shortcut, translate_shortcut])
        .expect("failed to register global shortcuts")
        .with_handler(move |app, shortcut, event| {
            if event.state == ShortcutState::Released {
                return;
            }

            if shortcut.id() == define_shortcut_id {
                let _ = open_quick_define_window(app);
                return;
            }

            if shortcut.id() == translate_shortcut_id {
                let _ = open_quick_translate_window(app);
            }
        })
        .build();

    tauri::Builder::default()
        .manage(AppState::default())
        .plugin(global_shortcut_plugin)
        .plugin(tauri_plugin_http::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_sql::Builder::new().build())
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_clipboard_x::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .setup(|app| {
            build_tray(app.handle())?;
            Ok(())
        })
        .on_window_event(|window, event| {
            if window.label() != MAIN_WINDOW_LABEL {
                return;
            }

            if let WindowEvent::CloseRequested { api, .. } = event {
                let state = window.state::<AppState>();
                if should_hide_to_tray(&state) {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            greet,
            set_hide_to_tray,
            hide_to_tray,
            show_main_window_command,
            open_quick_define,
            open_quick_translate
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
