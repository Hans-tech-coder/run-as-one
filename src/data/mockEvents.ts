export interface EventCategory {
  id: string;
  name: string;
  distance: string;
  price: number;
}

export interface RunningEvent {
  id: string;
  title: string;
  date: string;
  location: string;
  imageUrl: string;
  description: string;
  categories: EventCategory[];
  inclusions: string[];
  logisticsOptions: {
    pickup: boolean;
    deliveryFee: number;
  };
}

export const mockEvents: RunningEvent[] = [
  {
    id: '1',
    title: 'BERLIN MARATHON 2024',
    date: 'SEP 29, 2024',
    location: 'BERLIN, GERMANY',
    imageUrl: 'https://images.unsplash.com/photo-1552674605-db6ffd4facb5?q=80&w=1200&auto=format&fit=crop',
    description: 'The BMW BERLIN-MARATHON is one of the largest and most popular marathons in the world. Famous for its flat and fast course, it is the perfect stage for setting personal bests and world records.',
    categories: [
      { id: 'c1', name: 'Full Marathon', distance: '42.195 KM', price: 12500 }
    ],
    inclusions: ['Premium Race Singlet', 'Finisher Medal', 'Race Bib with RFID', 'String Bag', 'E-Certificate'],
    logisticsOptions: { pickup: true, deliveryFee: 250 }
  },
  {
    id: "e2",
    title: "Tokyo 5K",
    date: "September 7, 2024",
    location: "Tokyo, Japan",
    imageUrl: 'https://images.unsplash.com/photo-1530143311094-34d807799e8f?q=80&w=800&auto=format&fit=crop',
    description: 'Experience the vibrant streets of Tokyo in this energetic 5K run. Perfect for beginners and seasoned runners looking for a fast, scenic route through the heart of the city.',
    categories: [
      { id: 'c2', name: 'Fun Run', distance: '5 KM', price: 1500 }
    ],
    inclusions: ['Race Singlet', 'Finisher Medal', 'Race Bib', 'E-Certificate'],
    logisticsOptions: { pickup: true, deliveryFee: 200 }
  },
  {
    id: '3',
    title: 'NEW YORK CITY RUN',
    date: 'NOV 03, 2024',
    location: 'NEW YORK, USA',
    imageUrl: 'https://images.unsplash.com/photo-1452626022479-ad41505cbbb1?q=80&w=800&auto=format&fit=crop',
    description: 'Take on the iconic streets of the Big Apple. The New York City Run offers a challenging yet rewarding course that passes through diverse neighborhoods, culminating in an unforgettable finish.',
    categories: [
      { id: 'c3', name: 'Half Marathon', distance: '21.1 KM', price: 3500 },
      { id: 'c4', name: '10K Challenge', distance: '10 KM', price: 2000 }
    ],
    inclusions: ['Exclusive Tech Shirt', 'Finisher Medal', 'Race Bib with RFID', 'E-Certificate', 'Post-Race Refreshments'],
    logisticsOptions: { pickup: true, deliveryFee: 300 }
  }
];
