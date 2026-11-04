/** Demo records used for the in-memory store and for seeding an empty database. */
const daysAgo = (days) => {
  const date = new Date();
  date.setDate(date.getDate() - days);
  return date;
};

const SEED_ITEMS = [
  {
    type: 'Found',
    itemName: 'Black leather wallet',
    description:
      'Standard black wallet with a few cards inside. Found on the back seat of a minibus heading to Merkato.',
    category: 'Wallet',
    location: 'Merkato, Addis Ababa',
    date: daysAgo(2),
    status: 'Unclaimed',
    contactName: 'Selam',
    contactPhone: '+251 91 234 5678',
    hiddenDetails: 'Contains a blue student ID card',
  },
  {
    type: 'Found',
    itemName: 'Silver iPhone 14 Pro',
    description:
      'Silver iPhone with a blue case. Small scratch on the top-left corner of the screen. Locked, so please describe the lock screen to claim.',
    category: 'Electronics',
    location: 'Bole Medhanialem, Addis Ababa',
    date: daysAgo(4),
    status: 'Unclaimed',
    contactName: 'Dawit',
    contactEmail: 'dawit@example.com',
  },
  {
    type: 'Lost',
    itemName: 'Set of three university textbooks',
    description:
      'A stack of three Addis Ababa University textbooks tied with a string. Lost between Arat Kilo and Sidist Kilo.',
    category: 'Books',
    location: 'Arat Kilo, Addis Ababa',
    date: daysAgo(6),
    status: 'Unclaimed',
    contactName: 'Hana',
    contactPhone: '+251 92 345 6789',
  },
  {
    type: 'Found',
    itemName: 'Bunch of keys with a red tag',
    description: 'Four keys on a ring with a small red plastic tag. Found near the entrance of Meskel Square.',
    category: 'Keys',
    location: 'Meskel Square, Addis Ababa',
    date: daysAgo(1),
    status: 'Unclaimed',
  },
  {
    type: 'Lost',
    itemName: 'Kebele ID card holder',
    description: 'Small brown ID holder with a kebele card and two bank cards. Lost around Piassa.',
    category: 'ID & Cards',
    location: 'Piassa, Addis Ababa',
    date: daysAgo(9),
    status: 'Claimed',
    contactName: 'Yonas',
    contactPhone: '+251 93 456 7890',
  },
  {
    type: 'Found',
    itemName: 'Blue school backpack',
    description:
      'Blue backpack with notebooks and a pencil case. Found at the Anbessa bus terminal in Kaliti.',
    category: 'Bags',
    location: 'Kaliti, Addis Ababa',
    date: daysAgo(3),
    status: 'Unclaimed',
    contactName: 'Meron',
    contactPhone: '+251 94 567 8901',
  },
];

module.exports = { SEED_ITEMS };
