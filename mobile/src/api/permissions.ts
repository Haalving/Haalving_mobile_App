import * as ImagePicker from 'expo-image-picker';
import { useEffect, useSyncExternalStore } from 'react';
import { AppState, Linking, Platform } from 'react-native';

/**
 * CAMERA ACCESS, ASKED AT THE FRONT DOOR AND REMEMBERED.
 *
 * The meal wizard used to be the first place the camera was requested, and on
 * a phone that had already said no it printed "no camera access" and stopped —
 * a dead end at the moment a plate is on the table. Now the shell asks as soon
 * as the client is in, the OS remembers the answer, and a refusal is not
 * final: Today carries a reminder until access is on, and once Android stops
 * showing the dialog (`canAskAgain` false) the reminder opens the phone's
 * Settings instead of asking again.
 *
 * Module state rather than a store: the answer is the OS's, this only mirrors
 * it so screens can react without asking the system on every render.
 */
export type CameraAccess = 'unknown' | 'granted' | 'denied' | 'blocked';

let state: CameraAccess = 'unknown';
const listeners = new Set<() => void>();

function set(next: CameraAccess): void {
  if (next === state) return;
  state = next;
  listeners.forEach((l) => l());
}

const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
};

function read(p: ImagePicker.PermissionResponse): CameraAccess {
  if (p.granted) return 'granted';
  return p.canAskAgain ? 'denied' : 'blocked';
}

/** What the OS says now, mirrored into the module. */
export async function refreshCameraAccess(): Promise<CameraAccess> {
  if (Platform.OS === 'web') return 'unknown';
  try {
    const p = await ImagePicker.getCameraPermissionsAsync();
    set(read(p));
  } catch {
    /* a permission module that throws is not an answer; keep what we had */
  }
  return state;
}

/** The system dialog, when the OS still shows one; the mirrored answer either way. */
export async function askForCamera(): Promise<ImagePicker.PermissionResponse> {
  const p = await ImagePicker.requestCameraPermissionsAsync();
  set(read(p));
  return p;
}

/**
 * At the front door: ask while the OS still allows asking. Android shows the
 * dialog for two refusals and then stops; from there the reminder on Today is
 * the way back in, through Settings.
 */
export async function askForCameraOnStart(): Promise<void> {
  if (Platform.OS === 'web') return;
  try {
    const p = await ImagePicker.getCameraPermissionsAsync();
    set(read(p));
    if (p.granted || !p.canAskAgain) return;
    await askForCamera();
  } catch {
    /* a permission module that throws must not stop the shell painting */
  }
}

export function openCameraSettings(): void {
  void Linking.openSettings();
}

/** The mirrored answer, refreshed whenever the app comes back to the front — from Settings, say. */
export function useCameraAccess(): CameraAccess {
  const access = useSyncExternalStore(subscribe, () => state, () => state);
  useEffect(() => {
    if (state === 'unknown') void refreshCameraAccess();
    const sub = AppState.addEventListener('change', (s) => {
      if (s === 'active') void refreshCameraAccess();
    });
    return () => sub.remove();
  }, []);
  return access;
}
