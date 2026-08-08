import { useEffect, useMemo, useRef, useState } from 'react'

export function useVoiceTyping(onTranscript) {
  const recognitionRef = useRef(null)
  const [supported, setSupported] = useState(false)
  const [listening, setListening] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition
    if (SpeechRecognition) {
      setSupported(true)
      recognitionRef.current = new SpeechRecognition()
      recognitionRef.current.continuous = false
      recognitionRef.current.interimResults = true
      recognitionRef.current.lang = 'en-US'
      recognitionRef.current.onresult = (event) => {
        let finalText = ''
        for (let i = event.resultIndex; i < event.results.length; i += 1) {
          finalText += event.results[i][0].transcript
        }
        if (finalText.trim()) onTranscript(finalText.trim())
      }
      recognitionRef.current.onend = () => setListening(false)
      recognitionRef.current.onerror = (e) => {
        setError(e.error || 'Voice recognition error')
        setListening(false)
      }
    }
  }, [onTranscript])

  const start = async () => {
    setError('')
    if (!supported || !recognitionRef.current) {
      setError('Speech recognition is not supported in this browser.')
      return
    }
    try {
      recognitionRef.current.start()
      setListening(true)
    } catch {
      setListening(false)
    }
  }

  const stop = () => {
    recognitionRef.current?.stop()
    setListening(false)
  }

  return useMemo(() => ({ supported, listening, error, start, stop }), [supported, listening, error])
}
