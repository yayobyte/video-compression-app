import { useVideoPlayer, VideoView } from 'expo-video'
import { StyleSheet } from 'react-native'
import { colors, radius } from '../theme'

export default function CardPreview({ uri }: { uri: string }) {
  const player = useVideoPlayer(uri, (player) => {
    player.loop = false
    player.muted = false
  })
  return <VideoView player={player} style={styles.preview} contentFit="contain" nativeControls />
}

const styles = StyleSheet.create({
  preview: { width: '100%', height: 220, borderRadius: radius.md, backgroundColor: colors.elevated },
})