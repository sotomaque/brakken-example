import { memo, useCallback, useEffect, useRef, useState } from 'react'

const POPUP_INTERVAL = 60 * 1000 // 1 minute

/** Images use sequential naming: expressvpn-1.png through expressvpn-7.png */
const AD_IMAGES = Array.from({ length: 5 }, (_, i) => `/expressvpn-${i + 1}.png`)

function randomImage() {
  return AD_IMAGES[Math.floor(Math.random() * AD_IMAGES.length)]
}

const TAGLINES = [
  'Protect your killbox coordinates from prying eyes!',
  'The NSA called — they said use ExpressVPN.',
  'Your ISP is watching your airspace deconfliction. Stay safe.',
  '9 out of 10 military planners agree: you NEED a VPN. The 10th one got hacked.',
  "Don't let hackers see your ROZ! Get ExpressVPN now!",
  'BREAKING: Airspace data leaked! Could have been prevented with ExpressVPN.',
  'Your commanding officer uses ExpressVPN. Just saying.',
  'FREE TRIAL — Protect your AOR in just 1 click!',
  'WARNING: Unprotected airspace detected! Install ExpressVPN immediately.',
  'Hot singles in your AOR want you to use ExpressVPN.',
  'CONGRATULATIONS! You are the 1,000,000th airspace planner! Claim your FREE VPN!',
  'Your firewall called. It wants ExpressVPN.',
]

const CTA_LABELS = [
  'GET EXPRESSVPN NOW — 49% OFF',
  'CLAIM YOUR FREE TRIAL',
  'DOWNLOAD NOW — LIMITED TIME',
  'PROTECT YOUR AOR TODAY',
  'YES, I WANT 49% OFF!',
  'SECURE MY KILLBOX',
]

function randomTagline() {
  return TAGLINES[Math.floor(Math.random() * TAGLINES.length)]
}

function randomCta() {
  return CTA_LABELS[Math.floor(Math.random() * CTA_LABELS.length)]
}

/* ─── Single popup window ─── */
function AdPopup({ id, onClose }: { id: number; onClose: (id: number) => void }) {
  const [position] = useState(() => ({
    top: 40 + Math.random() * (window.innerHeight - 400),
    left: 40 + Math.random() * (window.innerWidth - 440),
  }))
  const [shaking, setShaking] = useState(false)
  const [closeAttempts, setCloseAttempts] = useState(0)
  const image = useRef(randomImage())
  const tagline = useRef(randomTagline())
  const cta = useRef(randomCta())

  const handleClose = useCallback(() => {
    if (closeAttempts < 1) {
      // First close attempt shakes
      setShaking(true)
      setCloseAttempts(n => n + 1)
      setTimeout(() => setShaking(false), 600)
    } else {
      onClose(id)
    }
  }, [closeAttempts, onClose, id])

  return (
    <div
      className={`spamPopup ${shaking ? 'spamShake' : ''}`}
      style={{ top: position.top, left: position.left }}
    >
      <button type="button" className="spamPopupClose" onClick={handleClose}>
        {closeAttempts < 1 ? '✕' : '✕'}
      </button>
      <img src={image.current} alt="ExpressVPN" className="spamPopupImg" />
      <p className="spamPopupTagline">{tagline.current}</p>
      <button
        type="button"
        className="spamPopupCta"
        onClick={() => window.open('https://www.expressvpn.com', '_blank')}
      >
        {cta.current}
      </button>
      <p className="spamPopupFine">
        {closeAttempts < 1 ? "You can't close this. Don't even try." : 'Fine. You win this round.'}
      </p>
    </div>
  )
}

/* ─── Main SpamAd component ─── */
export default memo(function SpamAd() {
  const [enabled, setEnabled] = useState(false)
  const [popups, setPopups] = useState<number[]>([])
  const nextId = useRef(0)
  const [bannerDismissed, setBannerDismissed] = useState(false)
  const [bannerReturns, setBannerReturns] = useState(0)

  // Spawn a new popup
  const spawnPopup = useCallback(() => {
    const id = nextId.current++
    setPopups(prev => [...prev, id])
  }, [])

  // Timed popup spawner — every POPUP_INTERVAL
  useEffect(() => {
    if (!enabled) return
    const id = setInterval(spawnPopup, POPUP_INTERVAL)
    return () => clearInterval(id)
  }, [enabled, spawnPopup])

  // Clear popups when toggling off
  useEffect(() => {
    if (!enabled) {
      setPopups([])
      setBannerDismissed(false)
    }
  }, [enabled])

  // Closing a popup spawns a new one — you have to close 2 in a row to truly clear them
  const totalClosed = useRef(0)
  const handlePopupClose = useCallback((closedId: number) => {
    totalClosed.current++
    // Every 2nd close actually removes all. Odd closes spawn a replacement.
    if (totalClosed.current % 2 === 0) {
      setPopups([])
    } else {
      setPopups(prev => {
        const without = prev.filter(p => p !== closedId)
        const freshId = nextId.current++
        return [...without, freshId]
      })
    }
  }, [])

  // Banner "dismiss" — it comes back after a few seconds
  const handleBannerClose = useCallback(() => {
    setBannerDismissed(true)
    setBannerReturns(n => n + 1)
    setTimeout(() => setBannerDismissed(false), 4000)
  }, [])

  return (
    <>
      {/* ── Toggle button ── */}
      <button
        type="button"
        className="spamToggle"
        onClick={() => setEnabled(v => !v)}
        title={enabled ? 'Disable ads' : 'Enable ads'}
      >
        {enabled ? 'ADS: ON' : 'ADS: OFF'}
      </button>

      {enabled ? (
        <>
          {/* ── Top banner ── */}
          {!bannerDismissed ? (
            <div className="spamBanner">
              <img src="/expressvpn-banner.png" alt="ExpressVPN" className="spamBannerImg" />
              <span className="spamBannerText">
                {bannerReturns === 0
                  ? '🔒 SECURE YOUR AIRSPACE — Get ExpressVPN Today!'
                  : bannerReturns === 1
                    ? "🔒 Told you it'd come back. GET EXPRESSVPN."
                    : bannerReturns < 5
                      ? `🔒 Dismissed ${bannerReturns}x. We admire your persistence. GET EXPRESSVPN.`
                      : `🔒 ${bannerReturns} dismissals?! You CLEARLY need ExpressVPN for this level of stubbornness.`}
              </span>
              <button
                type="button"
                className="spamBannerCta"
                onClick={() => window.open('https://www.expressvpn.com', '_blank')}
              >
                GET 49% OFF
              </button>
              <button type="button" className="spamBannerClose" onClick={handleBannerClose}>
                ✕
              </button>
            </div>
          ) : null}

          {/* ── Popups — multiple can stack ── */}
          {popups.length > 0 ? (
            <div className="spamOverlay">
              {popups.map(id => (
                <AdPopup key={id} id={id} onClose={handlePopupClose} />
              ))}
            </div>
          ) : null}
        </>
      ) : null}
    </>
  )
})
