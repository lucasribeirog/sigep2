import React, { useState } from 'react';
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Header } from '../components/Header';
import { SummaryCard } from '../components/SummaryCard';
import { StatusChip } from '../components/StatusChip';
import { styles } from '../styles/styles';
import type { Requisicao } from '../types/requisicao';

type Props = {
  requisicoes: Requisicao[];
  onAbrirDetalhe: (requisicao: Requisicao) => void;
  onSair: () => void;
};

export function ListaScreen({
  requisicoes,
  onAbrirDetalhe,
  onSair,
}: Props) {
  const [termoBusca, setTermoBusca] = useState('');
  const [carregando, setCarregando] = useState(false);

  const recebidas = requisicoes.filter((r) => r.status === 'Recebida').length;
  const emExame = requisicoes.filter((r) => r.status === 'Em exame').length;
  const concluidas = requisicoes.filter((r) => r.status === 'Concluída').length;

  const requisicoesFiltradas = requisicoes.filter((req) => {
    const termo = termoBusca.trim().toLowerCase();

    if (termo.length === 0) {
      return true;
    }

    return (
      req.numero.toLowerCase().includes(termo) ||
      req.natureza.toLowerCase().includes(termo) ||
      req.unidade.toLowerCase().includes(termo) ||
      req.status.toLowerCase().includes(termo)
    );
  });

  function atualizarRequisicoes() {
    setCarregando(true);

    setTimeout(() => {
      setCarregando(false);
    }, 1200);
  }

  return (
    <SafeAreaView style={styles.container}>
      <Header
        title="Requisições"
        subtitle="SIGEP2.0"
        actionText="Sair"
        onAction={onSair}
      />

      <View style={styles.summaryRow}>
        <SummaryCard title="Recebidas" value={String(recebidas)} />
        <SummaryCard title="Em exame" value={String(emExame)} />
        <SummaryCard title="Concluídas" value={String(concluidas)} />
      </View>

      <View style={styles.searchBox}>
        <TextInput
          placeholder="Pesquisar por número, natureza, unidade ou status"
          style={styles.searchInput}
          value={termoBusca}
          onChangeText={setTermoBusca}
        />
      </View>

      <View style={styles.actionsRow}>
        <Text style={styles.resultCount}>
          {requisicoesFiltradas.length} requisição(ões)
        </Text>

        <Pressable
          style={({ pressed }) => [
            styles.refreshButton,
            pressed && styles.buttonPressed,
          ]}
          onPress={atualizarRequisicoes}
        >
          {carregando ? (
            <ActivityIndicator size="small" color="#FFFFFF" />
          ) : (
            <Text style={styles.refreshButtonText}>Atualizar</Text>
          )}
        </Pressable>
      </View>

      <FlatList
        data={requisicoesFiltradas}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.listContent}
        ListEmptyComponent={
          <View style={styles.emptyBox}>
            <Text style={styles.emptyTitle}>Nenhuma requisição encontrada</Text>
            <Text style={styles.emptyText}>
              Tente pesquisar por outro número, natureza, unidade ou status.
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.requestCard,
              pressed && styles.cardPressed,
            ]}
            onPress={() => onAbrirDetalhe(item)}
          >
            <View style={styles.requestTop}>
              <View style={styles.requestInfo}>
                <Text style={styles.requestNumber}>{item.numero}</Text>
                <Text style={styles.requestNature}>{item.natureza}</Text>
              </View>

              <StatusChip status={item.status} />
            </View>

            <Text style={styles.requestUnit}>{item.unidade}</Text>
            <Text style={styles.requestDate}>Data: {item.data}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}