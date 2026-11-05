import { useState, useEffect, useRef, useCallback } from 'react';
import { TextInput, ScrollView } from 'react-native';
import { XStack, YStack, Button, Input, Text, H4 } from 'tamagui';
import { AdaptiveSheet } from '@/components/AdaptiveSheet';

const PROMPT_HEIGHT = 300;
const INPUT_FOCUS_DELAY_MS = 300;

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
  const scrollRef = useRef<ScrollView>(null);
  const inputFocused = useRef(false);
  const [inputKey, setInputKey] = useState(0);

  const revealFocusedInput = useCallback(() => {
    if (inputFocused.current) {
      scrollRef.current?.scrollToEnd({ animated: false });
    }
  }, []);

  // Remount input with fresh defaultValue when dialog opens
  useEffect(() => {
    inputFocused.current = false;
    if (open) {
      valueRef.current = defaultValue;
      setInputKey((k) => k + 1);
    }
  }, [open, defaultValue]);

  // Focus input after dialog animation completes
  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), INPUT_FOCUS_DELAY_MS);
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
    <AdaptiveSheet open={open} onOpenChange={onOpenChange} testID="PromptDialog.Content" height={PROMPT_HEIGHT}>
      <ScrollView
        ref={scrollRef}
        keyboardShouldPersistTaps="handled"
        onLayout={revealFocusedInput}
        onContentSizeChange={revealFocusedInput}
      >
        <YStack gap="$3">
          <H4 testID="PromptDialog.Title">{title}</H4>
          <Text testID="PromptDialog.Message" color="$gray11" fontSize="$3">
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
            onFocus={() => {
              inputFocused.current = true;
              revealFocusedInput();
            }}
            onBlur={() => { inputFocused.current = false; }}
            onSubmitEditing={handleSubmit}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </YStack>
      </ScrollView>
      <XStack gap="$3" justifyContent="flex-end" paddingTop="$3">
        <Button testID="PromptDialog.CancelButton" size="$4" chromeless onPress={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button testID="PromptDialog.SubmitButton" size="$4" theme="blue" onPress={handleSubmit}>
          {submitLabel}
        </Button>
      </XStack>
    </AdaptiveSheet>
  );
}
