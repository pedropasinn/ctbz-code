import React from 'react';
import { Box, Text } from 'ink';
import { colors } from '../lib/branding.js';

export const StatusBar: React.FC<{ cwd: string; mode: string }> = ({ cwd, mode }) => (
  <Box justifyContent="space-between" paddingX={1}>
    <Text color={colors.muted}>
      <Text color={colors.accent}>●</Text> {mode}
    </Text>
    <Text color={colors.muted} dimColor>{cwd}</Text>
  </Box>
);
