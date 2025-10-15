// This file acts as our temporary in-memory database
const items = [
    {
      id: 1,
      itemName: 'Black Leather Wallet',
      description: 'A standard black wallet containing various cards. Found on the back seat.',
      category: 'Wallet',
      locationFound: 'Bus Plate #AA12345',
      dateFound: '2023-10-26',
      status: 'Unclaimed',
      imageUrl: 'https://via.placeholder.com/300x200.png?text=Wallet' // Placeholder image
    },
    {
      id: 2,
      itemName: 'iPhone 14 Pro',
      description: 'Silver iPhone with a blue case. Screen has a small scratch on the top left.',
      category: 'Electronics',
      locationFound: 'Merkato Bus Station',
      dateFound: '2023-10-25',
      status: 'Unclaimed',
      imageUrl: 'https://via.placeholder.com/300x200.png?text=iPhone' // Placeholder image
    },
    {
      id: 3,
      itemName: 'University Textbooks',
      description: 'A stack of three books for Addis Ababa University, tied with a string.',
      category: 'Books',
      locationFound: 'Bus Plate #BB54321',
      dateFound: '2023-10-27',
      status: 'Claimed',
      imageUrl: 'https://via.placeholder.com/300x200.png?text=Books' // Placeholder image
    }
  ];
  
  module.exports = items;