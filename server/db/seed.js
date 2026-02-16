// Seed script for rfid_codes and scan_positions tables
// Runs only when tables are empty (first boot or after reset)

function seed(db) {
  const rfidCount = db.prepare('SELECT COUNT(*) as count FROM rfid_codes').get().count;
  const posCount = db.prepare('SELECT COUNT(*) as count FROM scan_positions').get().count;

  if (rfidCount === 0) {
    seedRfidCodes(db);
  }

  if (posCount === 0) {
    seedScanPositions(db);
  }
}

function seedRfidCodes(db) {
  const codes = [
    // Spades (s)
    { rfid_code: '24580', suit: 's', rank: 'A', value: 1 },
    { rfid_code: '19204', suit: 's', rank: '2', value: 2 },
    { rfid_code: '06404', suit: 's', rank: '3', value: 3 },
    { rfid_code: '14596', suit: 's', rank: '4', value: 4 },
    { rfid_code: '20228', suit: 's', rank: '5', value: 5 },
    { rfid_code: '19716', suit: 's', rank: '6', value: 6 },
    { rfid_code: '18436', suit: 's', rank: '7', value: 7 },
    { rfid_code: '06916', suit: 's', rank: '8', value: 8 },
    { rfid_code: '57604', suit: 's', rank: '9', value: 9 },
    { rfid_code: '27652', suit: 's', rank: '10', value: 0 },
    { rfid_code: '49924', suit: 's', rank: 'J', value: 0 },
    { rfid_code: '06660', suit: 's', rank: 'Q', value: 0 },
    { rfid_code: '15108', suit: 's', rank: 'K', value: 0 },

    // Diamonds (d)
    { rfid_code: '19972', suit: 'd', rank: 'A', value: 1 },
    { rfid_code: '11012', suit: 'd', rank: '2', value: 2 },
    { rfid_code: '13316', suit: 'd', rank: '3', value: 3 },
    { rfid_code: '09220', suit: 'd', rank: '4', value: 4 },
    { rfid_code: '08452', suit: 'd', rank: '5', value: 5 },
    { rfid_code: '12548', suit: 'd', rank: '6', value: 6 },
    { rfid_code: '28164', suit: 'd', rank: '7', value: 7 },
    { rfid_code: '35076', suit: 'd', rank: '8', value: 8 },
    { rfid_code: '99901', suit: 'd', rank: '9', value: 9 },  // Placeholder: was duplicate of 11012 (D2)
    { rfid_code: '22788', suit: 'd', rank: '10', value: 0 },
    { rfid_code: '36356', suit: 'd', rank: 'J', value: 0 },
    { rfid_code: '37380', suit: 'd', rank: 'Q', value: 0 },
    { rfid_code: '20740', suit: 'd', rank: 'K', value: 0 },

    // Hearts (h)
    { rfid_code: '45316', suit: 'h', rank: 'A', value: 1 },
    { rfid_code: '12804', suit: 'h', rank: '2', value: 2 },
    { rfid_code: '56324', suit: 'h', rank: '3', value: 3 },
    { rfid_code: '07172', suit: 'h', rank: '4', value: 4 },
    { rfid_code: '08196', suit: 'h', rank: '5', value: 5 },
    { rfid_code: '33540', suit: 'h', rank: '6', value: 6 },
    { rfid_code: '08964', suit: 'h', rank: '7', value: 7 },
    { rfid_code: '35844', suit: 'h', rank: '8', value: 8 },
    { rfid_code: '34564', suit: 'h', rank: '9', value: 9 },
    { rfid_code: '02308', suit: 'h', rank: '10', value: 0 },
    { rfid_code: '08708', suit: 'h', rank: 'J', value: 0 },
    { rfid_code: '13828', suit: 'h', rank: 'Q', value: 0 },
    { rfid_code: '46084', suit: 'h', rank: 'K', value: 0 },

    // Clubs (c)
    { rfid_code: '44292', suit: 'c', rank: 'A', value: 1 },
    { rfid_code: '23300', suit: 'c', rank: '2', value: 2 },
    { rfid_code: '99902', suit: 'c', rank: '3', value: 3 },  // Placeholder: was duplicate of 19204 (S2)
    { rfid_code: '49156', suit: 'c', rank: '4', value: 4 },
    { rfid_code: '32772', suit: 'c', rank: '5', value: 5 },
    { rfid_code: '99903', suit: 'c', rank: '6', value: 6 },  // Placeholder: was duplicate of 36356 (DJ)
    { rfid_code: '10244', suit: 'c', rank: '7', value: 7 },
    { rfid_code: '99904', suit: 'c', rank: '8', value: 8 },  // Placeholder: was duplicate of 08452 (D5)
    { rfid_code: '48132', suit: 'c', rank: '9', value: 9 },
    { rfid_code: '99905', suit: 'c', rank: '10', value: 0 }, // Placeholder: was duplicate of 18436 (S7)
    { rfid_code: '05636', suit: 'c', rank: 'J', value: 0 },
    { rfid_code: '15876', suit: 'c', rank: 'Q', value: 0 },
    { rfid_code: '23556', suit: 'c', rank: 'K', value: 0 },
  ];

  const stmt = db.prepare(
    'INSERT INTO rfid_codes (rfid_code, suit, rank, value) VALUES (?, ?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    for (const c of codes) {
      stmt.run(c.rfid_code, c.suit, c.rank, c.value);
    }
  });

  insertAll();
  console.log(`[Seed] Inserted ${codes.length} RFID codes`);
}

function seedScanPositions(db) {
  const positions = [
    { scan_index: 0, position_name: 'P-Right', server_intposi: 2 },
    { scan_index: 1, position_name: 'B-Right', server_intposi: 5 },
    { scan_index: 2, position_name: 'P-Left', server_intposi: 1 },
    { scan_index: 3, position_name: 'B-Left', server_intposi: 4 },
    { scan_index: 4, position_name: '5th Card', server_intposi: -1 },
    { scan_index: 5, position_name: '6th Card', server_intposi: -1 },
  ];

  const stmt = db.prepare(
    'INSERT INTO scan_positions (scan_index, position_name, server_intposi) VALUES (?, ?, ?)'
  );

  const insertAll = db.transaction(() => {
    for (const p of positions) {
      stmt.run(p.scan_index, p.position_name, p.server_intposi);
    }
  });

  insertAll();
  console.log(`[Seed] Inserted ${positions.length} scan positions`);
}

module.exports = { seed };
