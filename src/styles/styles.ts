import { StyleSheet } from 'react-native';

export const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F3F5F7',
  },

  loginContainer: {
    flex: 1,
    backgroundColor: '#0B1320',
    justifyContent: 'center',
    padding: 24,
  },

  loginCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 26,
    padding: 24,
    elevation: 8,
    alignItems: 'center',
  },

  logoCircle: {
    width: 74,
    height: 74,
    borderRadius: 37,
    backgroundColor: '#0B1320',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
  },

  logoCircleText: {
    color: '#FFFFFF',
    fontSize: 36,
    fontWeight: 'bold',
  },

  appName: {
    fontSize: 32,
    fontWeight: 'bold',
    color: '#0B1320',
  },

  appSubtitle: {
    fontSize: 14,
    color: '#6B7280',
    marginTop: 4,
    marginBottom: 28,
  },

  input: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#D1D5DB',
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 13,
    fontSize: 16,
    marginBottom: 12,
    backgroundColor: '#FFFFFF',
  },

  primaryButton: {
    width: '100%',
    height: 52,
    borderRadius: 14,
    backgroundColor: '#0B1320',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 10,
  },

  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },

  buttonPressed: {
    opacity: 0.7,
  },

  cardPressed: {
    opacity: 0.85,
  },

  footerText: {
    fontSize: 12,
    color: '#6B7280',
    textAlign: 'center',
    marginTop: 14,
  },

  header: {
    backgroundColor: '#0B1320',
    paddingHorizontal: 18,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },

  headerTextArea: {
    flex: 1,
  },

  headerTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
  },

  headerSubtitle: {
    color: '#CBD5E1',
    fontSize: 13,
    marginTop: 2,
  },

  headerButton: {
    paddingHorizontal: 18,
    paddingVertical: 11,
    borderRadius: 10,
    backgroundColor: '#1E293B',
    minWidth: 74,
    alignItems: 'center',
  },

  headerAction: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: 'bold',
  },

  summaryRow: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  summaryCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 14,
    alignItems: 'center',
    elevation: 2,
    marginHorizontal: 4,
  },

  summaryValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0B1320',
  },

  summaryTitle: {
    fontSize: 12,
    color: '#6B7280',
    marginTop: 2,
  },

  searchBox: {
    paddingHorizontal: 16,
    paddingTop: 14,
  },

  searchInput: {
    backgroundColor: '#FFFFFF',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E5E7EB',
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },

  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
  },

  resultCount: {
    flex: 1,
    fontSize: 13,
    color: '#6B7280',
    fontWeight: '600',
  },

  refreshButton: {
    backgroundColor: '#0B1320',
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 12,
    minWidth: 94,
    alignItems: 'center',
    justifyContent: 'center',
  },

  refreshButtonText: {
    color: '#FFFFFF',
    fontSize: 13,
    fontWeight: 'bold',
  },

  listContent: {
    padding: 16,
  },

  requestCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 18,
    marginBottom: 12,
    elevation: 3,
  },

  requestTop: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },

  requestInfo: {
    flex: 1,
    paddingRight: 10,
  },

  requestNumber: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#0B1320',
  },

  requestNature: {
    fontSize: 15,
    color: '#374151',
    marginTop: 4,
  },

  requestUnit: {
    fontSize: 13,
    color: '#6B7280',
  },

  requestDate: {
    fontSize: 13,
    color: '#6B7280',
    marginTop: 4,
  },

  statusChip: {
    borderRadius: 30,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },

  statusText: {
    fontSize: 12,
    fontWeight: 'bold',
  },

  emptyBox: {
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    padding: 24,
    alignItems: 'center',
    marginTop: 20,
  },

  emptyTitle: {
    fontSize: 17,
    fontWeight: 'bold',
    color: '#0B1320',
    marginBottom: 6,
  },

  emptyText: {
    fontSize: 14,
    color: '#6B7280',
    textAlign: 'center',
  },

  detailContainer: {
    padding: 16,
  },

  detailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 22,
    padding: 20,
    elevation: 4,
  },

  detailNumber: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#0B1320',
  },

  statusArea: {
    marginTop: 8,
    marginBottom: 8,
    alignSelf: 'flex-start',
  },

  detailField: {
    marginTop: 18,
  },

  detailFieldTitle: {
    fontSize: 12,
    color: '#6B7280',
    fontWeight: 'bold',
  },

  detailFieldValue: {
    fontSize: 16,
    color: '#111827',
    marginTop: 3,
  },
});