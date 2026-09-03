/**
 * The accounts a runner can transfer to, shared by both registration wizards.
 *
 * TODO: These belong on the Organizer, not in the bundle. Every event currently
 * shows the same three accounts, so an organizer who is not "Run As One Events"
 * would be collecting money into someone else's bank. The QR images are
 * placeholders and resolve to nothing.
 */

export interface BankOption {
  id: string;
  name: string;
  accountName: string;
  accountNumber: string;
  qrCode: string;
}

export const BANK_OPTIONS: BankOption[] = [
  {
    id: 'bdo',
    name: 'BDO Unibank',
    accountName: 'Run As One Events',
    accountNumber: '0012 3456 7890',
    qrCode: 'https://via.placeholder.com/200?text=BDO+QR+Code',
  },
  {
    id: 'bpi',
    name: 'BPI',
    accountName: 'Run As One Events',
    accountNumber: '0987 6543 21',
    qrCode: 'https://via.placeholder.com/200?text=BPI+QR+Code',
  },
  {
    id: 'metrobank',
    name: 'Metrobank',
    accountName: 'Run As One Events',
    accountNumber: '1122 3344 55',
    qrCode: 'https://via.placeholder.com/200?text=Metrobank+QR+Code',
  },
];
