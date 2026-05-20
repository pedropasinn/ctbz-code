import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { colors } from '../lib/branding.js';

export type Role = 'user' | 'assistant' | 'system';
export interface Message {
  role: Role;
  content: string;
  pending?: boolean;
  providerLabel?: string;  // ex: "Claude Code", "Gemini" — mostrado no label
}

const labelFor = (role: Role, providerLabel?: string) => {
  switch (role) {
    case 'user':
      return { text: 'você', color: colors.accent };
    case 'assistant':
      return { text: providerLabel ? `ctbz● via ${providerLabel}` : 'ctbz●',
               color: colors.primaryRender };
    case 'system':
      return { text: 'sistema', color: colors.muted };
  }
};

export const Messages: React.FC<{ items: Message[] }> = ({ items }) => (
  <Box flexDirection="column" marginBottom={1}>
    {items.map((m, i) => {
      const label = labelFor(m.role, m.providerLabel);
      return (
        <Box key={i} flexDirection="column" marginBottom={1}>
          <Text color={label.color} bold>{label.text}</Text>
          <Box paddingLeft={2}>
            {m.pending && !m.content ? (
              <Text color={colors.muted}>
                <Spinner type="dots" /> aguardando resposta...
              </Text>
            ) : (
              <Text color={colors.text}>{m.content}</Text>
            )}
          </Box>
        </Box>
      );
    })}
  </Box>
);
