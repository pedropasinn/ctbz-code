import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { colors, logoCompactPrefix, logoCompactDot, logoCompactSuffix } from '../lib/branding.js';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  disabled?: boolean;
}

export const PromptBox: React.FC<Props> = ({ value, onChange, onSubmit, disabled }) => (
  <Box
    borderStyle="round"
    borderColor={colors.primaryRender}
    paddingX={1}
    flexDirection="row"
  >
    <Box marginRight={1}>
      <Text color={colors.primaryRender} bold>{logoCompactPrefix}</Text>
      <Text color={colors.accent} bold>{logoCompactDot}</Text>
      <Text color={colors.primaryRender} bold>{logoCompactSuffix}</Text>
      <Text color={colors.accent} bold> ❯ </Text>
    </Box>
    {disabled ? (
      <Text color={colors.muted} dimColor>processando...</Text>
    ) : (
      <TextInput
        value={value}
        onChange={onChange}
        onSubmit={onSubmit}
        placeholder="pergunte algo, peça um relatório, rode um comando..."
      />
    )}
  </Box>
);
