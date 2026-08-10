import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, Animated, Keyboard } from 'react-native';
import { useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { useT } from '../utils/LanguageContext';
import { useAnnounceOnOpen } from '../utils/a11y';

export const AGE_VERIFIED_KEY = '@mangarecs/age_verified';

function pad(n) { return String(n).padStart(2, '0'); }

function validate(mm, dd, yyyy) {
  const m = parseInt(mm, 10);
  const d = parseInt(dd, 10);
  const y = parseInt(yyyy, 10);
  if (!m || !d || !y || yyyy.length < 4) return { ok: false, error: 'Enter a valid date of birth.' };
  if (m < 1 || m > 12) return { ok: false, error: 'Month must be 01–12.' };
  if (d < 1 || d > 31) return { ok: false, error: 'Day must be 01–31.' };
  const dob = new Date(y, m - 1, d);
  if (isNaN(dob.getTime())) return { ok: false, error: 'Enter a valid date of birth.' };
  const now = new Date();
  let age = now.getFullYear() - dob.getFullYear();
  const mDiff = now.getMonth() - dob.getMonth();
  if (mDiff < 0 || (mDiff === 0 && now.getDate() < dob.getDate())) age--;
  if (age < 18) return { ok: false, error: 'You must be 18 or older to access this content.' };
  return { ok: true };
}

export default function AgeGateModal({ visible, onVerified, onDismiss }) {
  const { colors } = useTheme();
  const t = useT();
  // The same string the sheet shows as its heading, so what is spoken and what
  // is on screen cannot drift apart.
  useAnnounceOnOpen(visible, t('gate.ageTitle'));
  const [mm, setMm] = useState('');
  const [dd, setDd] = useState('');
  const [yyyy, setYyyy] = useState('');
  const [error, setError] = useState('');
  const ddRef = useRef(null);
  const yyyyRef = useRef(null);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  function shake() {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue: 8,  duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 6,  duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: 0,  duration: 40, useNativeDriver: true }),
    ]).start();
  }

  async function handleConfirm() {
    Keyboard.dismiss();
    const result = validate(mm, dd, yyyy);
    if (!result.ok) {
      setError(result.error);
      shake();
      return;
    }
    await AsyncStorage.setItem(AGE_VERIFIED_KEY, 'true');
    setError('');
    setMm(''); setDd(''); setYyyy('');
    onVerified();
  }

  function handleClose() {
    setError('');
    setMm(''); setDd(''); setYyyy('');
    onDismiss();
  }

  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={handleClose}>
      <View style={s.overlay}>
        <Animated.View style={[s.sheet, { backgroundColor: colors.card, borderColor: colors.border, transform: [{ translateX: shakeAnim }] }]}>
          <View style={[s.iconWrap, { backgroundColor: 'rgba(120, 88, 255,0.15)' }]}>
            <Ionicons name="shield-checkmark" size={32} color={colors.primary} />
          </View>
          <Text style={[s.title, { color: colors.text }]}>{t('gate.ageTitle')}</Text>
          <Text style={[s.sub, { color: colors.muted }]}>
            Adult content is restricted to users 18 and older.{'\n'}Enter your date of birth to continue.
          </Text>

          <View style={s.dobRow}>
            <View style={s.fieldWrap}>
              <Text style={[s.fieldLabel, { color: colors.muted }]}>MM</Text>
              <TextInput
                style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                placeholder="01"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={2}
                value={mm}
                onChangeText={(v) => {
                  setMm(v);
                  if (v.length === 2) ddRef.current?.focus();
                }}
                returnKeyType="next"
                onSubmitEditing={() => ddRef.current?.focus()}
              
                accessibilityLabel={t('a11y.birthMonth')}/>
            </View>
            <Text style={[s.dobSep, { color: colors.muted }]}>/</Text>
            <View style={s.fieldWrap}>
              <Text style={[s.fieldLabel, { color: colors.muted }]}>DD</Text>
              <TextInput
                ref={ddRef}
                style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                placeholder="15"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={2}
                value={dd}
                onChangeText={(v) => {
                  setDd(v);
                  if (v.length === 2) yyyyRef.current?.focus();
                }}
                returnKeyType="next"
                onSubmitEditing={() => yyyyRef.current?.focus()}
              
                accessibilityLabel={t('a11y.birthDay')}/>
            </View>
            <Text style={[s.dobSep, { color: colors.muted }]}>/</Text>
            <View style={[s.fieldWrap, { flex: 2 }]}>
              <Text style={[s.fieldLabel, { color: colors.muted }]}>YYYY</Text>
              <TextInput
                ref={yyyyRef}
                style={[s.input, { backgroundColor: colors.inputBg, borderColor: colors.border, color: colors.text }]}
                placeholder="1995"
                placeholderTextColor={colors.muted}
                keyboardType="number-pad"
                maxLength={4}
                value={yyyy}
                onChangeText={setYyyy}
                returnKeyType="done"
                onSubmitEditing={handleConfirm}
              
                accessibilityLabel={t('a11y.birthYear')}/>
            </View>
          </View>

          {!!error && <Text style={[s.error, { color: colors.error }]}>{error}</Text>}

          <TouchableOpacity style={[s.confirmBtn, { backgroundColor: colors.primary }]} onPress={handleConfirm} activeOpacity={0.85}>
            <Text style={[s.confirmBtnText, { color: colors.onPrimary }]}>{t('gate.confirmAge')}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={[s.cancelBtnText, { color: colors.muted }]}>{t('common.cancel')}</Text>
          </TouchableOpacity>
          <Text style={[s.disclaimer, { color: colors.muted, opacity: 0.7 }]}>
            Your date of birth is used only for age verification and is not stored on our servers.
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  sheet: { borderRadius: 24, padding: 28, width: '100%', borderWidth: 1, alignItems: 'center' },
  iconWrap: { width: 64, height: 64, borderRadius: 32, alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  dobRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 8, width: '100%' },
  fieldWrap: { flex: 1, alignItems: 'center' },
  fieldLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  input: { width: '100%', borderRadius: 12, borderWidth: 1, fontSize: 18, fontWeight: '600', textAlign: 'center', paddingVertical: 12 },
  dobSep: { fontSize: 22, fontWeight: '300', paddingBottom: 10, paddingHorizontal: 2 },
  error: { fontSize: 12, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  confirmBtn: { borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 8, marginBottom: 8 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cancelBtn: { paddingVertical: 10, width: '100%', alignItems: 'center' },
  cancelBtnText: { fontSize: 14 },
  disclaimer: { fontSize: 10, textAlign: 'center', lineHeight: 15, marginTop: 12 },
});
