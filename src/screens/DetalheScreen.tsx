import React from 'react';
import { View, Text, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '../components/Header';
import { StatusChip } from '../components/StatusChip';
import { DetailField } from '../components/DetailField';
import { styles } from '../styles/styles';
import type { Requisicao } from '../types/requisicao';

type Props = {
  requisicao: Requisicao;
  onVoltar: () => void;
};

export function DetalheScreen({ requisicao, onVoltar }: Props) {
  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Detalhes"
        subtitle={requisicao.numero}
        actionText="Voltar"
        onAction={onVoltar}
      />

      <ScrollView contentContainerStyle={styles.detailContainer}>
        <View style={styles.detailCard}>
          <Text style={styles.detailNumber}>{requisicao.numero}</Text>

          <View style={styles.statusArea}>
            <StatusChip status={requisicao.status} />
          </View>

          <DetailField title="Natureza" value={requisicao.natureza} />
          <DetailField title="Unidade" value={requisicao.unidade} />
          <DetailField title="Data" value={requisicao.data} />
          <DetailField title="Solicitante" value={requisicao.solicitante} />
          <DetailField title="Procedimento" value={requisicao.procedimento} />
          <DetailField title="Observação" value={requisicao.observacao} />

          <Pressable
            style={({ pressed }) => [
              styles.primaryButton,
              pressed && styles.buttonPressed,
            ]}
            onPress={onVoltar}
          >
            <Text style={styles.primaryButtonText}>
              Voltar para requisições
            </Text>
          </Pressable>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}