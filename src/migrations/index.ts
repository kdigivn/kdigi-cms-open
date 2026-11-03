import * as migration_20261103_042515_initial from './20261103_042515_initial';
import * as migration_20261103_052647_media_source_media_id from './20261103_052647_media_source_media_id';

export const migrations = [
  {
    up: migration_20261103_042515_initial.up,
    down: migration_20261103_042515_initial.down,
    name: '20261103_042515_initial',
  },
  {
    up: migration_20261103_052647_media_source_media_id.up,
    down: migration_20261103_052647_media_source_media_id.down,
    name: '20261103_052647_media_source_media_id'
  },
];
