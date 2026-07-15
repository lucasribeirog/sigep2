import React from 'react';
import { View, Text } from 'react-native';

import { styles } from '../styles/styles';

type Props = {
  title: string;
  value: string;
};

export function SummaryCard({ title, value }: Props) {
  return (
    <View style={styles.summaryCard}>
      <Text style={styles.summaryValue}>{value}</Text>
      <Text style={styles.summaryTitle}>{title}</Text>
    </View>
  );
}