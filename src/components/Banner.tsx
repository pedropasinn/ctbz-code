import React from 'react';
import { Box, Text } from 'ink';
import { logoC, logoDot, tagline, colors } from '../lib/branding.js';

export const Banner: React.FC = () => (
  <Box flexDirection="column" alignItems="flex-start" marginBottom={1}>
    {/* logo: bloco "CTBZ" em marinho + ponto ciano grande à direita */}
    <Box flexDirection="row" alignItems="flex-end">
      <Text color={colors.primaryRender} bold>{logoC}</Text>
      <Box paddingBottom={1} marginLeft={1}>
        <Text color={colors.accent} bold>{logoDot}</Text>
      </Box>
    </Box>

    <Box paddingLeft={2}>
      <Text color={colors.muted}>{tagline}</Text>
    </Box>

    <Box paddingLeft={2} marginTop={1}>
      <Text color={colors.muted}>
        Digite <Text color={colors.accent} bold>/help</Text> para comandos •{' '}
        <Text color={colors.accent} bold>Ctrl+C</Text> para sair
      </Text>
    </Box>
  </Box>
);
