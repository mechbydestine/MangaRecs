import { View, Text, Modal, StyleSheet, TouchableOpacity, TextInput, Animated, Keyboard } from 'react-native';
import { useState, useRef } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export const AGE_VERIFIED_KEY = '@panelr/age_verified';

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
        <Animated.View style={[s.sheet, { transform: [{ translateX: shakeAnim }] }]}>
          <View style={s.iconWrap}>
            <Ionicons name="shield-checkmark" size={32} color="#534AB7" />
          </View>
          <Text style={s.title}>Age Verification</Text>
          <Text style={s.sub}>
            Adult content is restricted to users 18 and older.{'\n'}Enter your date of birth to continue.
          </Text>

          <View style={s.dobRow}>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>MM</Text>
              <TextInput
                style={s.input}
                placeholder="01"
                placeholderTextColor="#5C5B63"
                keyboardType="number-pad"
                maxLength={2}
                value={mm}
                onChangeText={(v) => {
                  setMm(v);
                  if (v.length === 2) ddRef.current?.focus();
                }}
                returnKeyType="next"
                onSubmitEditing={() => ddRef.current?.focus()}
              />
            </View>
            <Text style={s.dobSep}>/</Text>
            <View style={s.fieldWrap}>
              <Text style={s.fieldLabel}>DD</Text>
              <TextInput
                ref={ddRef}
                style={s.input}
                placeholder="15"
                placeholderTextColor="#5C5B63"
                keyboardType="number-pad"
                maxLength={2}
                value={dd}
                onChangeText={(v) => {
                  setDd(v);
                  if (v.length === 2) yyyyRef.current?.focus();
                }}
                returnKeyType="next"
                onSubmitEditing={() => yyyyRef.current?.focus()}
              />
            </View>
            <Text style={s.dobSep}>/</Text>
            <View style={[s.fieldWrap, { flex: 2 }]}>
              <Text style={s.fieldLabel}>YYYY</Text>
              <TextInput
                ref={yyyyRef}
                style={s.input}
                placeholder="1995"
                placeholderTextColor="#5C5B63"
                keyboardType="number-pad"
                maxLength={4}
                value={yyyy}
                onChangeText={setYyyy}
                returnKeyType="done"
                onSubmitEditing={handleConfirm}
              />
            </View>
          </View>

          {!!error && <Text style={s.error}>{error}</Text>}

          <TouchableOpacity style={s.confirmBtn} onPress={handleConfirm} activeOpacity={0.85}>
            <Text style={s.confirmBtnText}>Confirm Age</Text>
          </TouchableOpacity>
          <TouchableOpacity style={s.cancelBtn} onPress={handleClose} activeOpacity={0.7}>
            <Text style={s.cancelBtnText}>Cancel</Text>
          </TouchableOpacity>
          <Text style={s.disclaimer}>
            Your date of birth is used only for age verification and is not stored on our servers.
          </Text>
        </Animated.View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.75)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 },
  sheet: { backgroundColor: '#13131A', borderRadius: 24, padding: 28, width: '100%', borderWidth: 1, borderColor: '#2A2A2F', alignItems: 'center' },
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: 'rgba(83,74,183,0.15)', alignItems: 'center', justifyContent: 'center', marginBottom: 16 },
  title: { fontSize: 20, fontWeight: '700', color: '#fff', marginBottom: 8, textAlign: 'center' },
  sub: { fontSize: 13, color: '#9B9AA3', textAlign: 'center', lineHeight: 20, marginBottom: 24 },
  dobRow: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, marginBottom: 8, width: '100%' },
  fieldWrap: { flex: 1, alignItems: 'center' },
  fieldLabel: { fontSize: 10, color: '#5C5B63', fontWeight: '700', letterSpacing: 1, marginBottom: 4, textTransform: 'uppercase' },
  input: { width: '100%', backgroundColor: '#1A1A1F', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A2F', color: '#fff', fontSize: 18, fontWeight: '600', textAlign: 'center', paddingVertical: 12 },
  dobSep: { color: '#5C5B63', fontSize: 22, fontWeight: '300', paddingBottom: 10, paddingHorizontal: 2 },
  error: { color: '#FF6B6B', fontSize: 12, textAlign: 'center', marginBottom: 12, lineHeight: 18 },
  confirmBtn: { backgroundColor: '#534AB7', borderRadius: 14, paddingVertical: 14, width: '100%', alignItems: 'center', marginTop: 8, marginBottom: 8 },
  confirmBtnText: { color: '#fff', fontSize: 15, fontWeight: '600' },
  cancelBtn: { paddingVertical: 10, width: '100%', alignItems: 'center' },
  cancelBtnText: { color: '#9B9AA3', fontSize: 14 },
  disclaimer: { fontSize: 10, color: '#3C3C44', textAlign: 'center', lineHeight: 15, marginTop: 12 },
});
