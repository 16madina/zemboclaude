import { useCallback, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, View, type NativeScrollEvent, type NativeSyntheticEvent } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, textShadow } from '../theme';
import type { Post } from '../data/feed';
import { VideoPost } from './VideoPost';
import { CommentsSheet } from './CommentsSheet';
import { ShareSheet } from './ShareSheet';
import { UserProfile, type ProfileTarget } from '../post/UserProfile';

// Lecteur plein écran ouvert depuis une grille (Découvrir, Profil, messages)
export function VideoViewer({ posts, start, onClose }: { posts: Post[]; start: number | null; onClose: () => void }) {
  return (
    <Modal visible={start !== null} animationType="slide" presentationStyle="fullScreen" onRequestClose={onClose}>
      <SafeAreaProvider>{start !== null && <Viewer posts={posts} start={start} onClose={onClose} />}</SafeAreaProvider>
    </Modal>
  );
}

function Viewer({ posts, start, onClose }: { posts: Post[]; start: number; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const [height, setHeight] = useState(0);
  const [active, setActive] = useState(start);
  const [commentsFor, setCommentsFor] = useState<Post | null>(null);
  const [shareFor, setShareFor] = useState<Post | null>(null);

  const onScrollEnd = (e: NativeSyntheticEvent<NativeScrollEvent>) => {
    if (height) setActive(Math.round(e.nativeEvent.contentOffset.y / height));
  };
  const openComments = useCallback((p: Post) => setCommentsFor(p), []);
  const openShare = useCallback((p: Post) => setShareFor(p), []);
  const noop = useCallback(() => {}, []);
  const [profileOf, setProfileOf] = useState<ProfileTarget | null>(null);
  const openProfile = useCallback((p: Post) => p.uid && setProfileOf({ uid: p.uid, pseudo: p.user.handle, name: p.user.name }), []);

  return (
    <View style={[styles.root, { paddingBottom: insets.bottom }]}>
      <View style={{ flex: 1 }} onLayout={(e) => setHeight(Math.round(e.nativeEvent.layout.height))}>
        {height > 0 && (
          <FlatList
            data={posts}
            keyExtractor={(p, i) => `${p.id}-${i}`}
            renderItem={({ item, index }) => (
              <VideoPost
                post={item}
                height={height}
                isActive={index === active && !profileOf}
                onComments={openComments}
                onShare={openShare}
                onOpenLive={noop}
                onProfile={openProfile}
              />
            )}
            initialScrollIndex={start}
            getItemLayout={(_, i) => ({ length: height, offset: height * i, index: i })}
            pagingEnabled
            decelerationRate="fast"
            showsVerticalScrollIndicator={false}
            onMomentumScrollEnd={onScrollEnd}
            initialNumToRender={2}
            windowSize={3}
          />
        )}
      </View>
      <Pressable onPress={onClose} hitSlop={12} style={[styles.back, { top: insets.top + 8 }]}>
        <Ionicons name="chevron-back" size={30} color={colors.white} style={textShadow} />
      </Pressable>
      <CommentsSheet post={commentsFor} onClose={() => setCommentsFor(null)} />
      <ShareSheet post={shareFor} onClose={() => setShareFor(null)} />
      <UserProfile target={profileOf} onClose={() => setProfileOf(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  back: { position: 'absolute', left: 10 },
});
