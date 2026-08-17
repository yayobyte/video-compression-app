import { Ionicons } from '@expo/vector-icons'
import { StyleSheet, Text, View } from 'react-native'
import { colors, gaps, typography } from '../theme'

export default function BrandHeader() {
  return (
    <View style={styles.row}>
      <Ionicons name="film-outline" size={18} color={colors.text} />
      <Text style={styles.brand}>clippress</Text>
    </View>
  )
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: gaps.sm },
  brand: { ...typography.brand, color: colors.text },
})