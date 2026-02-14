import { useState, useEffect } from 'react';
import { Dialog, XStack, Button, Input, Text } from 'tamagui';

interface PromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  message: string;
  defaultValue?: string;
  placeholder?: string;
  onSubmit: (value: string) => void;
  submitLabel?: string;
}

export function PromptDialog({
  open,
  onOpenChange,
  title,
  message,
  defaultValue = '',
  placeholder,
  onSubmit,
  submitLabel = 'Save',
}: PromptDialogProps) {
  const [value, setValue] = useState(defaultValue);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [open, defaultValue]);

  const handleSubmit = () => {
    onSubmit(value);
    onOpenChange(false);
  };

  return (
    <Dialog modal open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay
          key="overlay"
          animation="quick"
          opacity={0.5}
          enterStyle={{ opacity: 0 }}
          exitStyle={{ opacity: 0 }}
        />
        <Dialog.Content
          bordered
          elevate
          key="content"
          animation={[
            'quick',
            { opacity: { overshootClamping: true } },
          ]}
          enterStyle={{ opacity: 0, scale: 0.95, y: -10 }}
          exitStyle={{ opacity: 0, scale: 0.95, y: -10 }}
          width={320}
          padding="$4"
          gap="$3"
        >
          <Dialog.Title>{title}</Dialog.Title>
          <Text color="$gray11" fontSize="$3">
            {message}
          </Text>
          <Input
            size="$4"
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            autoFocus
            onSubmitEditing={handleSubmit}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <XStack gap="$3" justifyContent="flex-end">
            <Dialog.Close displayWhenAdapted asChild>
              <Button size="$3" chromeless>
                Cancel
              </Button>
            </Dialog.Close>
            <Button size="$3" theme="blue" onPress={handleSubmit}>
              {submitLabel}
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
