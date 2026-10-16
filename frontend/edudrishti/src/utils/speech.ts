import React from "react"

/**
 * Hook for browser speech synthesis
 * Provides voice playback of student report summaries in English
 */
export function useSpeechSynthesis() {
  const [isSupported, setIsSupported] = React.useState(false)
  const [isSpeaking, setIsSpeaking] = React.useState(false)

  React.useEffect(() => {
    const hasSpeech = typeof window !== "undefined" && "speechSynthesis" in window
    setIsSupported(!!hasSpeech)
  }, [])

  const getAvailableVoices = () => {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) return []
    return (window as any).speechSynthesis.getVoices()
  }

  const speak = (text: string, language: string = "en") => {
    if (!isSupported) return

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1
    utterance.pitch = 1
    utterance.volume = 1
    utterance.lang = "en-US"

    const voices = getAvailableVoices()
    const englishVoice = voices.find(
      (voice: any) => voice.lang === "en-US" || voice.name === "Google US English"
    )
    if (englishVoice) {
      utterance.voice = englishVoice
    }

    utterance.onstart = () => setIsSpeaking(true)
    utterance.onend = () => setIsSpeaking(false)
    utterance.onerror = () => setIsSpeaking(false)

    ;(window as any).speechSynthesis.speak(utterance)
  }

  const stop = () => {
    if (typeof window !== "undefined" && (window as any).speechSynthesis) {
      ;(window as any).speechSynthesis.cancel()
      setIsSpeaking(false)
    }
  }

  return { isSupported, isSpeaking, speak, stop }
}