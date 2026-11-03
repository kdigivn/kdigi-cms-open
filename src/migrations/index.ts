import * as migration_20261103_042515_initial from './20261103_042515_initial';

export const migrations = [
  {
    up: migration_20261103_042515_initial.up,
    down: migration_20261103_042515_initial.down,
    name: '20261103_042515_initial'
  },
];
