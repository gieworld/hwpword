import type { CommandDef } from '../types';
import { OptionsDialog } from '../../ui/options-dialog';

export const toolCommands: CommandDef[] = [
  {
    id: 'tool:options',
    opensDialog: true,
    label: 'Options',
    execute(services) {
      const dlg = new OptionsDialog(services.eventBus);
      dlg.show();
    },
  },
];
