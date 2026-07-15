import React from 'react';
import { View, Text } from 'react-native';

import { styles } from '../styles/styles';

type Props = {
  title: string;
  value: string;
};

export function DetailField({ title, value }: Props) {
  return (
    <View style={styles.detailField}>
      <Text style={styles.detailFieldTitle}>{title}</Text>
      <Text style={styles.detailFieldValue}>{value}</Text>
    </View>
  );
}