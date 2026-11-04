/** Realistic demo records for the in-memory store / first Mongo boot. */
const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const SEED_ITEMS = [
  {
    itemName: 'Black leather wallet',
    category: 'Wallet',
    description:
      'Black bip-fold wallet with a few cards and some birr notes inside. Found on the back seat after the bus reached the terminal.',
    identifyingDetails: 'Contains a blue student ID card and a photo of two children',
    agency: 'Anbessa City Bus',
    plateNumber: 'AA-3-12345',
    busCode: 'B-118',
    route: 'Merkato – Bole',
    foundOnBoard: 'Back seat',
    foundAt: daysAgo(2),
    reportedBy: 'Supervisor Tesfaye A.',
    status: 'In Storage',
    storageOffice: 'Lost Property Office, Merkato',
  },
  {
    itemName: 'Silver iPhone 13',
    category: 'Electronics',
    description:
      'Silver iPhone with a cracked corner and a clear case. The phone is switched off and locked. Handed in by the supervisor at the end of the shift.',
    identifyingDetails: 'Lock screen shows a photo of a yellow car; IMEI ends in 4471',
    agency: 'Sheger Mass Transport',
    plateNumber: 'AA-2-45789',
    busCode: 'S-042',
    route: 'Megenagna – Kaliti',
    foundOnBoard: 'Seat 14, window side',
    foundAt: daysAgo(4),
    reportedBy: 'Supervisor Meseret G.',
    status: 'In Storage',
    storageOffice: 'Lost Property Office, Kaliti Depot',
  },
  {
    itemName: 'Student backpack with textbooks',
    category: 'Bags',
    description:
      'Blue backpack containing three university textbooks, a pencil case and a notebook. Kept at the depot office since the bus returned.',
    identifyingDetails: 'Name "Hana T." written inside the front pocket',
    agency: 'Anbessa City Bus',
    plateNumber: 'AA-3-20871',
    busCode: 'B-205',
    route: 'Arat Kilo – Sidist Kilo',
    foundOnBoard: 'Under seat 12',
    foundAt: daysAgo(6),
    reportedBy: 'Supervisor Dawit M.',
    status: 'In Storage',
    storageOffice: 'Lost Property Office, Merkato',
  },
  {
    itemName: 'Bunch of keys with a red tag',
    category: 'Keys',
    description: 'Four keys on a ring with a small red plastic tag. Found on the floor near the front door.',
    identifyingDetails: 'Red tag has the letter "K" written on it',
    agency: 'Anbessa City Bus',
    plateNumber: 'AA-3-11890',
    busCode: 'B-311',
    route: 'Piassa – Merkato',
    foundOnBoard: 'Near the front door',
    foundAt: daysAgo(1),
    reportedBy: 'Supervisor Yonas B.',
    status: 'In Storage',
    storageOffice: 'Lost Property Office, Piassa Terminal',
  },
  {
    itemName: 'Kebele ID card holder',
    category: 'ID & Cards',
    description:
      'Small brown card holder with a kebele ID and two bank cards. Returned to the owner after they quoted the correct name and card numbers.',
    identifyingDetails: 'Kebele ID issued in Woreda 07',
    agency: 'Sheger Mass Transport',
    plateNumber: 'AA-2-33015',
    busCode: 'S-167',
    route: 'Bole – Megenagna',
    foundOnBoard: 'Seat 3',
    foundAt: daysAgo(14),
    reportedBy: 'Supervisor Selam H.',
    status: 'Returned',
    storageOffice: 'Lost Property Office, Kaliti Depot',
  },
  {
    itemName: 'Blue umbrella',
    category: 'Other',
    description: 'Folding blue umbrella with a wooden handle, left on the seat during the morning rush.',
    identifyingDetails: 'Small tear on the canopy near the handle',
    agency: 'Anbessa City Bus',
    plateNumber: 'AA-3-55602',
    busCode: 'B-077',
    route: 'Meskel Square – Bole',
    foundOnBoard: 'Middle seat, left side',
    foundAt: daysAgo(3),
    reportedBy: 'Supervisor Abebe K.',
    status: 'In Storage',
    storageOffice: 'Lost Property Office, Meskel Square',
  },
];

module.exports = { SEED_ITEMS };
