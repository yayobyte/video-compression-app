import { StatusBar } from 'expo-status-bar'
import { ScrollView, StyleSheet, Text, View } from 'react-native'
import { SafeAreaView } from 'react-native-safe-area-context'
import { colors, gaps, radius, spacing, surfaces, typography } from '../theme'
import ActionButtons from '../components/ActionButtons'
import BrandHeader from '../components/BrandHeader'
import EmptyState from '../components/EmptyState'
import EngineSwitch from '../components/EngineSwitch'
import FooterNote from '../components/FooterNote'
import ProfileSwitches from '../components/ProfileSwitches'
import ServerConfigCard from '../components/ServerConfigCard'
import StorageInspector from '../components/StorageInspector'
import VideoCard from '../components/VideoCard'
import useAssets from '../hooks/useAssets'
import useEngine from '../hooks/useEngine'
import usePersistence from '../hooks/usePersistence'
import useServerConnection from '../hooks/useServerConnection'
import useStorage from '../hooks/useStorage'

export default function HomeScreen() {
  const server = useServerConnection()
  const storage = useStorage()
  const engine = useEngine()
  const assets = useAssets(server.serverUrl, server.pingServer, engine.engine)
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

        <View style={styles.controlCard}>
          <EngineSwitch engine={engine.engine} deviceAvailable={engine.deviceAvailable} onChange={engine.setEngine} />
          <View style={styles.divider} />
          <ProfileSwitches profile={assets.globalProfile} onChange={assets.setGlobalProfile} isCodecLocked={engine.engine === 'device'} />
          {engine.engine === 'server' ? <View style={styles.divider} /> : null}
          {engine.engine === 'server' ? <ServerConfigCard
            serverInput={server.serverInput}
            savingServer={server.savingServer}
            serverHealth={server.serverHealth}
            onChangeInput={server.setServerInput}
            onApply={server.applyServerUrl}
            onCheck={() => void server.pingServer(server.serverUrl)}
          /> : null}
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
            onCancel={engine.engine === 'device' && asset.phase === 'compressing' ? () => assets.cancelConvert(asset) : undefined}
            onShare={() => void assets.shareOutput(asset)}
            onDeleteOriginal={() => assets.deleteOriginal(asset)}
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
  notice: { ...typography.captionEmphasis, color: colors.accent, backgroundColor: colors.surfaceScrim, padding: spacing.sm, borderRadius: radius.md, textAlign: 'center' },
  controlCard: { ...surfaces.card, gap: gaps.sm },
  divider: { ...surfaces.divider, marginVertical: spacing.xxs },
})