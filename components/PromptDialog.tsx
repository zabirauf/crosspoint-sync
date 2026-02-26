import { useState, useEffect, useRef } from 'react';
import { TextInput } from 'react-native';
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
  const inputRef = useRef<TextInput>(null);

  // Reset value when dialog opens
  useEffect(() => {
    if (open) {
      setValue(defaultValue);
    }
  }, [open, defaultValue]);

  // Focus input after dialog animation completes
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [open]);

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
          testID="PromptDialog.Content"
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
            testID="PromptDialog.Input"
            size="$4"
            value={value}
            onChangeText={setValue}
            placeholder={placeholder}
            ref={inputRef as any}
            onSubmitEditing={handleSubmit}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <XStack gap="$3" justifyContent="flex-end">
            <Dialog.Close displayWhenAdapted asChild>
              <Button testID="PromptDialog.CancelButton" size="$3" chromeless>
                Cancel
              </Button>
            </Dialog.Close>
            <Button testID="PromptDialog.SubmitButton" size="$3" theme="blue" onPress={handleSubmit}>
              {submitLabel}
            </Button>
          </XStack>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog>
  );
}
