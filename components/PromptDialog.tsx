import { useState, useEffect, useRef, useCallback } from 'react';
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
  const valueRef = useRef(defaultValue);
  const inputRef = useRef<TextInput>(null);
  const [inputKey, setInputKey] = useState(0);

  // Remount input with fresh defaultValue when dialog opens
  useEffect(() => {
    if (open) {
      valueRef.current = defaultValue;
      setInputKey((k) => k + 1);
    }
  }, [open, defaultValue]);

  // Focus input after dialog animation completes
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 300);
      return () => clearTimeout(timer);
    }
  }, [open, inputKey]);

  const handleChangeText = useCallback((text: string) => {
    valueRef.current = text;
  }, []);

  const handleSubmit = () => {
    onSubmit(valueRef.current);
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
            key={inputKey}
            testID="PromptDialog.Input"
            size="$4"
            defaultValue={defaultValue}
            onChangeText={handleChangeText}
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
