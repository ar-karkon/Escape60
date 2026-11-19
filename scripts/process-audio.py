# Reproducible audio prep: python3 scripts/process-audio.py <downloaded-sources-dir> web/assets/audio
# Source files are listed in web/assets/audio/CREDITS.md (OpenGameArt, CC0 / CC-BY).
import subprocess, numpy as np, wave, os, sys
SRC = sys.argv[1]; OUT = sys.argv[2]
os.makedirs(OUT, exist_ok=True)
def run(args): subprocess.run(['ffmpeg', '-v', 'error', '-y'] + args, check=True)
def music(src, dst, ss, dur, fade_in=0.4, fade_out=2.5):
    run(['-ss', str(ss), '-t', str(dur), '-i', f'{SRC}/{src}', '-af',
         f'afade=t=in:d={fade_in},afade=t=out:st={dur-fade_out}:d={fade_out},loudnorm=I=-15:TP=-1.5:LRA=11',
         '-ar', '44100', '-ac', '2', '-c:a', 'libmp3lame', '-b:a', '96k', f'{OUT}/{dst}'])
def oneshot(src, dst, ss=0, dur=None, gain_lufs=-16, extra=''):
    args = ['-ss', str(ss)] + (['-t', str(dur)] if dur else []) + ['-i', src, '-af',
            (extra + ',' if extra else '') + f'loudnorm=I={gain_lufs}:TP=-1.0', '-ar', '44100', '-ac', '1', '-c:a', 'libmp3lame', '-b:a', '80k', f'{OUT}/{dst}']
    run(args)
def pcm(src, ss, dur, sr=22050):
    raw = subprocess.run(['ffmpeg', '-v', 'error', '-ss', str(ss), '-t', str(dur), '-i', src, '-ac', '1', '-ar', str(sr), '-f', 's16le', '-'], capture_output=True, check=True).stdout
    return np.frombuffer(raw, dtype=np.int16).astype(np.float32) / 32768
def loop_wav(src, dst, ss, dur, xfade=0.25, sr=22050, peak=0.7):
    a = pcm(src, ss, dur, sr)
    c = int(xfade * sr); L = len(a)
    t = np.linspace(0, 1, c, dtype=np.float32)
    out = a[:L - c].copy()
    out[:c] = a[:c] * t + a[L - c:] * (1 - t)
    out = out / (np.max(np.abs(out)) + 1e-6) * peak
    with wave.open(f'{OUT}/{dst}', 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(sr)
        w.writeframes((out * 32767).astype(np.int16).tobytes())
d = SRC
# Music (all CC0 / CC-BY, see web/assets/audio/CREDITS.md)
music('m_law.mp3', 'music-menu.mp3', 0, 96)
music('m_neon.mp3', 'music-chase-1.mp3', 6, 76)
music('m_overdrive.mp3', 'music-chase-2.mp3', 0, 76)
music('m_vice.mp3', 'music-chase-3.mp3', 0, 76)
music('m_cold.mp3', 'music-results.mp3', 16, 42, 1.0, 3)
# Loops
loop_wav(f'{d}/s_siren.mp3', 'siren-wail.wav', 21.95, 2.65, 0.12)
loop_wav(f'{d}/s_siren.mp3', 'siren-yelp.wav', 13.75, 2.5, 0.1)
loop_wav(f'{d}/s_heli.mp3', 'heli.wav', 0.6, 3.1, 0.2, peak=0.6)
loop_wav(f'{d}/s_squeal.wav', 'squeal.wav', 0, 3.0, 0.3, peak=0.6)
loop_wav(f'{d}/s_engine1.wav', 'engine.wav', 0, 0.66, 0.06, 22050, 0.7)
# One-shots
oneshot(f'{d}/s_crash.ogg', 'crash.mp3', gain_lufs=-12)
oneshot(f'{d}/s_horn.ogg', 'horn.mp3', gain_lufs=-16)
oneshot(f'{d}/s_whoosh.wav', 'whoosh.mp3', 0.0, 1.1, -16, 'afade=t=out:st=0.8:d=0.3')
oneshot(f'{d}/z_retro/power_up_01.ogg', 'combo.mp3', gain_lufs=-17)
oneshot(f'{d}/z_retro/power_up_06.ogg', 'levelup.mp3', gain_lufs=-16)
oneshot(f'{d}/z_retro/retro_coin_01.ogg', 'coin.mp3', gain_lufs=-18)
oneshot(f'{d}/z_retro/synth_beep_01.ogg', 'beep.mp3', gain_lufs=-18)
oneshot(f'{d}/z_retro/synth_beep_03.ogg', 'go.mp3', gain_lufs=-16)
oneshot(f'{d}/z_retro/retro_die_01.ogg', 'busted.mp3', gain_lufs=-15)
oneshot(f'{d}/z_retro/power_up_04.ogg', 'win.mp3', gain_lufs=-15)
oneshot(f'{d}/z_ui/click1.wav', 'click.mp3', gain_lufs=-20)
oneshot(f'{d}/z_break/bfh1_metal_hit_01.ogg', 'scrape.mp3', gain_lufs=-18)
oneshot(f'{d}/z_coin/coin3.wav', 'near.mp3', gain_lufs=-17)
print('done')
