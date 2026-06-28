import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '../utils/ThemeContext';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

export default function MobileHeader({ title, right, leftContent, noBorder = false }) {
  const navigation = useNavigation();
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const canGoBack = navigation.canGoBack();

  return (
    <View style={[
      styles.header,
      { backgroundColor: colors.background, paddingTop: insets.top + 10 },
      !noBorder && { borderBottomWidth: 1, borderBottomColor: colors.border },
    ]}>
      <View style={styles.left}>
        {canGoBack ? (
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.backBtn}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        ) : (
          <View style={styles.logoWrap}>
            <View style={styles.logoMark}>
              <Ionicons name="book" size={13} color="#fff" />
            </View>
            <Text style={[styles.logoText, { color: colors.text }]}>Panelr</Text>
          </View>
        )}
      </View>

      {leftContent ? leftContent : null}

      {title ? (
        <Text style={[styles.title, { color: colors.text }]} numberOfLines={1}>
          {title}
        </Text>
      ) : (
        <View style={styles.flex1} />
      )}

      <View style={styles.right}>
        {right ?? <View style={styles.placeholder} />}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingBottom: 12,
    paddingHorizontal: 16,
  },
  left: { width: 56, alignItems: 'flex-start' },
  right: { width: 56, alignItems: 'flex-end' },
  backBtn: { padding: 4 },
  logoWrap: { flexDirection: 'row', alignItems: 'center', gap: 7 },
  logoMark: {
    width: 26,
    height: 26,
    borderRadius: 8,
    backgroundColor: '#534AB7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoText: { fontSize: 17, fontWeight: 'bold', letterSpacing: 0.3 },
  title: { flex: 1, textAlign: 'center', fontSize: 16, fontWeight: '600' },
  flex1: { flex: 1 },
  placeholder: { width: 24 },
});
