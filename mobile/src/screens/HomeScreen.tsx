import { StatusBar } from 'expo-status-bar'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, gaps, spacing, surfaces, typography } from '../theme'
import ActionButtons from '../components/ActionButtons'
import BrandHeader from '../components/BrandHeader'
import EmptyState from '../components/EmptyState'
import FooterNote from '../components/FooterNote'
import ProfileSwitches from '../components/ProfileSwitches'
import ServerConfigCard from '../components/ServerConfigCard'
import StorageInspector from '../components/StorageInspector'
import VideoCard from '../components/VideoCard'
import useAssets from '../hooks/useAssets'
import useServerConnection from '../hooks/useServerConnection'
import useStorage from '../hooks/useStorage'

export default function HomeScreen() {
  const server = useServerConnection()
  const storage = useStorage()
  const assets = useAssets(server.serverUrl, server.pingServer)

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <StatusBar style="light" />
      <ScrollView contentContainerStyle={styles.scroll}>
        <BrandHeader />

        <Text style={styles.title}>Make your video library <Text style={styles.titleAccent}>lighter.</Text></Text>

        <View style={styles.controlCard}>
          <ProfileSwitches profile={assets.globalProfile} onChange={assets.setGlobalProfile} />
          <View style={styles.divider} />
          <ServerConfigCard
            serverInput={server.serverInput}
            savingServer={server.savingServer}
            serverHealth={server.serverHealth}
            onChangeInput={server.setServerInput}
            onApply={server.applyServerUrl}
            onCheck={() => void server.pingServer(server.serverUrl)}
          />
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
            onShare={() => void assets.shareOutput(asset)}
            onSetProfile={(codec, crf) => assets.setProfileOn(asset.id, asset.name, codec, crf)}
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
  controlCard: { ...surfaces.card, gap: gaps.sm },
  divider: { ...surfaces.divider, marginVertical: spacing.xxs },
})