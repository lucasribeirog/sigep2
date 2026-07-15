import React from 'react';
import { View, Text, Pressable } from 'react-native';

import { styles } from '../styles/styles';

type Props = {
  title: string;
  subtitle: string;
  actionText: string;
  onAction: () => void;
};

export function Header({ title, subtitle, actionText, onAction }: Props) {
  return (
    <View style={styles.header}>
      <View style={styles.headerTextArea}>
        <Text style={styles.headerTitle}>{title}</Text>
        <Text style={styles.headerSubtitle}>{subtitle}</Text>
      </View>

      <Pressable
        onPress={onAction}
        hitSlop={12}
        style={({ pressed }) => [
          styles.headerButton,
          pressed && styles.buttonPressed,
        ]}
      >
        <Text style={styles.headerAction}>{actionText}</Text>
      </Pressable>
    </View>
  );
}