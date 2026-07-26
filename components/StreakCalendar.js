import { View, Text, StyleSheet } from 'react-native';
import { useTheme } from '../utils/ThemeContext';
import { localDateKey } from '../utils/readerUtils';

const MONTH_ABBRS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAY_LABELS  = ['S','M','T','W','T','F','S'];

// Reading-activity heatmap, shared by ProfileScreen (own profile) and
// FriendProfileScreen (someone else's) — a calendar-accurate grid from the
// 1st of last month through today.
export default function StreakCalendar({ dailyLog }) {
  const { colors } = useTheme();
  const log = dailyLog || {};
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const firstOfLastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const startSunday = new Date(firstOfLastMonth);
  startSunday.setDate(startSunday.getDate() - startSunday.getDay());

  const allDays = [];
  const cursor = new Date(startSunday);
  while (cursor <= today) {
    allDays.push(new Date(cursor));
    cursor.setDate(cursor.getDate() + 1);
  }
  while (allDays.length % 7 !== 0) allDays.push(null);

  const weeks = [];
  for (let i = 0; i < allDays.length; i += 7) weeks.push(allDays.slice(i, i + 7));

  const monthHeaders = weeks.map((week, idx) => {
    for (const day of week) {
      if (day && day.getDate() === 1) return MONTH_ABBRS[day.getMonth()];
    }
    if (idx === 0) {
      const first = week.find((d) => d);
      return first ? MONTH_ABBRS[first.getMonth()] : null;
    }
    return null;
  });

  const currentMonth = today.getMonth();
  const currentYear  = today.getFullYear();

  function isCurrentMonth(date) {
    return date && date.getMonth() === currentMonth && date.getFullYear() === currentYear;
  }

  // Alpha-blended off the theme's own primary color, so the heatmap follows
  // Default/Dark/Light (and Dark's less-saturated purple) instead of a fixed
  // navy scale that read as near-black squares in Light mode.
  function getColor(hours) {
    if (!hours || hours <= 0) return colors.border;
    if (hours < 0.25) return colors.primary + '40';
    if (hours < 0.75) return colors.primary + '80';
    if (hours < 1.5)  return colors.primary + 'C0';
    return colors.primary;
  }

  return (
    <View style={styles.streakGrid}>
      <View style={styles.streakDayLabels}>
        <View style={styles.streakMonthSpacer} />
        {DAY_LABELS.map((label, i) => (
          <View key={i} style={styles.streakDayLabelRow}>
            <Text style={[styles.streakDayLabelText, { color: colors.textSecondary }]}>{label}</Text>
          </View>
        ))}
      </View>
      <View style={{ flexDirection: 'row' }}>
        {weeks.map((week, weekIdx) => (
          <View key={weekIdx} style={styles.streakWeekCol}>
            <View style={styles.streakMonthHeader}>
              {monthHeaders[weekIdx] ? (
                <Text style={[styles.streakMonthText, { color: colors.textSecondary }]}>{monthHeaders[weekIdx]}</Text>
              ) : null}
            </View>
            {week.map((day, dayIdx) => {
              const dateStr = day ? localDateKey(day) : null;
              const hours   = dateStr ? (log[dateStr] || 0) : 0;
              const future  = day && day > today;
              const inMonth = isCurrentMonth(day);
              return (
                <View
                  key={dayIdx}
                  style={[
                    styles.streakCell,
                    {
                      backgroundColor: getColor(future ? 0 : hours),
                      opacity: !day || future ? 0.15 : inMonth ? 1 : 0.45,
                    },
                  ]}
                />
              );
            })}
          </View>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  streakGrid: { flexDirection: 'row', marginBottom: 10 },
  streakDayLabels: { marginRight: 5 },
  streakMonthSpacer: { height: 16 },
  streakDayLabelRow: { height: 11, marginBottom: 3, justifyContent: 'center' },
  streakDayLabelText: { fontSize: 8, width: 8, textAlign: 'center' },
  streakWeekCol: { marginRight: 3 },
  streakMonthHeader: { height: 16, justifyContent: 'flex-end', paddingBottom: 2 },
  streakMonthText: { fontSize: 8 },
  streakCell: { width: 11, height: 11, borderRadius: 2, marginBottom: 3 },
});
