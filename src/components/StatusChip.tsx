import React from 'react';
import { View, Text } from 'react-native';

import { styles } from '../styles/styles';
import type { StatusRequisicao } from '../types/requisicao';

type Props = {
  status: StatusRequisicao;
};

export function StatusChip({ status }: Props) {
  const colors: Record<
    StatusRequisicao,
    {
      background: string;
      text: string;
    }
  > = {
    Recebida: {
      background: '#FFF3CD',
      text: '#856404',
    },
    Distribuída: {
      background: '#D1ECF1',
      text: '#0C5460',
    },
    'Em exame': {
      background: '#CCE5FF',
      text: '#004085',
    },
    Concluída: {
      background: '#D4EDDA',
      text: '#155724',
    },
  };

  return (
    <View
      style={[
        styles.statusChip,
        { backgroundColor: colors[status].background },
      ]}
    >
      <Text style={[styles.statusText, { color: colors[status].text }]}>
        {status}
      </Text>
    </View>
  );
}