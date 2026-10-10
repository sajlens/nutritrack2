// Zamiennik Alert.alert z React Native, który działa też w przeglądarce.
//
// Na webie Alert.alert z react-native-web nic nie robi — komunikaty by znikały,
// a potwierdzenia ("Usunąć posiłek?") nigdy by się nie wykonały. Tutaj na webie
// używamy window.alert / window.confirm, a na Androidzie zwykłego Alert.
//
// Wszystkie alerty w apce mają najwyżej 2 przyciski (Anuluj + akcja), więc
// window.confirm (OK / Anuluj) w zupełności wystarcza.
import { Alert as RNAlert, Platform } from 'react-native';
import type { AlertButton, AlertOptions } from 'react-native';

function webAlert(title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) {
  const text = message ? `${title}\n\n${message}` : title;

  if (!buttons || buttons.length <= 1) {
    window.alert(text);
    buttons?.[0]?.onPress?.();
    return;
  }

  const cancel = buttons.find(b => b.style === 'cancel');
  const action = buttons.find(b => b.style !== 'cancel') ?? buttons[buttons.length - 1];

  if (window.confirm(text)) {
    action.onPress?.();
  } else if (cancel?.onPress) {
    cancel.onPress();
  } else {
    options?.onDismiss?.();
  }
}

export const Alert = {
  alert: (title: string, message?: string, buttons?: AlertButton[], options?: AlertOptions) => {
    if (Platform.OS === 'web') webAlert(title, message, buttons, options);
    else RNAlert.alert(title, message, buttons, options);
  },
};
