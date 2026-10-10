import { StatusBar } from 'expo-status-bar'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, gaps, radius, spacing, surfaces, typography } from '../theme'
import ActionButtons from '../components/ActionButtons'
import BrandHeader from '../components/BrandHeader'
import EmptyState from '../components/EmptyState'
import FooterNote from '../components/FooterNote'
import ProfilePicker from '../components/ProfilePicker'
import StorageInspector from '../components/StorageInspector'
import VideoCard from '../components/VideoCard'
import { isOnDeviceAvailable } from '../compressor'
import useAssets from '../hooks/useAssets'
import usePersistence from '../hooks/usePersistence'
import useStorage from '../hooks/useStorage'

// Checked once: the native module is either in this build or not.
const COMPRESSOR_AVAILABLE = isOnDeviceAvailable()

export default function HomeScreen() {
  const storage = useStorage()
  const assets = useAssets()
  const persisted = usePersistence({
    assets: assets.assets,
    globalProfile: assets.globalProfile,
    setAssets: assets.setAssets,
    setGlobalProfile: assets.setGlobalProfile,
  })

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <BrandHeader />

        <Text style={styles.title}>Make your video library <Text style={styles.titleAccent}>lighter.</Text></Text>

        {persisted.notice ? <Text style={styles.notice}>{persisted.notice}</Text> : null}

        {COMPRESSOR_AVAILABLE ? null : (
          <Text style={styles.notice}>Compression needs a dev or Release build. It isn't available in Expo Go.</Text>
        )}

        <View style={styles.controlCard}>
          <ProfilePicker profile={assets.globalProfile} onChange={assets.setGlobalProfile} />
        </View>

        <ActionButtons canStart={assets.canStart} busy={assets.busy} onImport={() => void assets.importVideos()} onConvert={assets.convertAll} />

        <StorageInspector storage={storage.storage} inspection={storage.inspection} clearingStorage={storage.clearingStorage} onClearStorage={() => void storage.clearStorage()} />

        {assets.assets.length ? assets.assets.map((asset) => (
          <VideoCard
            key={asset.id}
            asset={asset}
            previewOpen={assets.preview === asset.id}
            onTogglePreview={() => assets.setPreview((current) => current === asset.id ? null : asset.id)}
            onConvert={() => void assets.runConvert(asset)}
            onCancel={() => assets.cancelConvert(asset)}
            onShare={() => void assets.shareOutput(asset)}
            onSaveToGallery={() => void assets.saveToGallery(asset)}
            onDeleteOriginal={() => assets.deleteOriginal(asset)}
            onSetProfile={(profile) => assets.setProfileOn(asset.id, asset.name, profile)}
          />
        )) : (
          <EmptyState />
        )}

        <FooterNote completed={assets.completed} />
      </ScrollView>
    </SafeAreaView>
  )
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.background },
  scroll: { padding: spacing.xl, gap: gaps.xl },
  title: { ...typography.title, color: colors.text, marginTop: spacing.xxs },
  titleAccent: { color: colors.accent },
  notice: { ...typography.captionEmphasis, color: colors.accent, backgroundColor: colors.surfaceScrim, padding: spacing.sm, borderRadius: radius.md, textAlign: 'center' },
  controlCard: { ...surfaces.card, gap: gaps.md },
})