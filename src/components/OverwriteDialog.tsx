import { Alert } from 'react-native';

export type OverwriteDialogOptions = {
  title?: string;
  message?: string;
  confirmText?: string;
  cancelText?: string;
};

const DEFAULTS: Required<Pick<OverwriteDialogOptions, 'title' | 'message' | 'confirmText' | 'cancelText'>> = {
  title: 'Overwrite?',
  message: 'Existing entries will be replaced. Continue?',
  confirmText: 'Overwrite',
  cancelText: 'Keep',
};

const OverwriteDialog = {
  open(options: OverwriteDialogOptions = {}): Promise<boolean> {
    const { title, message, confirmText, cancelText } = { ...DEFAULTS, ...options };

    return new Promise((resolve) => {
      Alert.alert(title, message, [
        {
          text: cancelText,
          style: 'cancel',
          onPress: () => resolve(false),
        },
        {
          text: confirmText,
          style: 'destructive',
          onPress: () => resolve(true),
        },
      ]);
    });
  },
};

export default OverwriteDialog;
