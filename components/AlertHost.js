import { useEffect, useState } from 'react';
import { View, Text, Modal, TouchableOpacity, StyleSheet } from 'react-native';
import { setAlertListener } from '../utils/appAlert';
import { useTheme } from '../utils/ThemeContext';
import { light } from '../utils/haptics';

export default function AlertHost() {
  const { colors } = useTheme();
  const [alert, setAlert] = useState(null); // { title, message, buttons }

  useEffect(() => {
    return setAlertListener((title, message, buttons) => {
      setAlert({ title, message, buttons: buttons?.length ? buttons : [{ text: 'OK' }] });
    });
  }, []);

  if (!alert) return null;

  function handlePress(btn) {
    setAlert(null);
    btn.onPress?.();
  }

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => setAlert(null)}>
      <View style={s.overlay}>
        <View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {!!alert.title && <Text style={[s.title, { color: colors.text }]}>{alert.title}</Text>}
          {!!alert.message && <Text style={[s.message, { color: colors.muted }]}>{alert.message}</Text>}
          <View style={s.buttonRow}>
            {alert.buttons.map((btn, i) => {
              const isDestructive = btn.style === 'destructive';
              const isCancel = btn.style === 'cancel';
              return (
                <TouchableOpacity
                  key={`${btn.text}-${i}`}
                  style={[
                    s.button,
                    isDestructive && s.buttonDestructive,
                    isCancel && [s.buttonCancel, { borderColor: colors.border }],
                  ]}
                  activeOpacity={0.85}
                  onPress={() => { light(); handlePress(btn); }}>
                  <Text style={[
                    s.buttonText,
                    isCancel && { color: colors.muted },
                  ]}>
                    {btn.text}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 32 },
  sheet: { borderRadius: 20, padding: 22, width: '100%', maxWidth: 340, borderWidth: 1 },
  title: { fontSize: 17, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  message: { fontSize: 13.5, lineHeight: 19, textAlign: 'center', marginBottom: 20 },
  buttonRow: { gap: 8 },
  button: { backgroundColor: '#7B5CFF', borderRadius: 12, paddingVertical: 12, alignItems: 'center' },
  buttonDestructive: { backgroundColor: '#E5534B' },
  buttonCancel: { backgroundColor: 'transparent', borderWidth: 1 },
  buttonText: { color: '#fff', fontSize: 14.5, fontWeight: '600' },
});
