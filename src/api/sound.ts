interface ISound {
	buffer: Promise<AudioBuffer>;
	gain: GainNode;
	panner?: StereoPannerNode;
	source?: Promise<AudioBufferSourceNode>;
}

function no_sound() {
	return {
		create_sound: () => 0,
		duplicate_sound: () => 0,
		play_sound: () => undefined,
		set_volume: () => undefined,
		stop_sound: () => undefined,
		delete_sound: () => undefined,
	};
}

function decodeAudioData(context: AudioContext, buffer: ArrayBuffer): Promise<AudioBuffer> {
	return new Promise((resolve, reject) => context.decodeAudioData(buffer, resolve, reject));
}

export default function init_sound() {
	const AudioContext = window.AudioContext || window.webkitAudioContext;
	const StereoPannerNode = window.StereoPannerNode;
	if (!AudioContext) return no_sound();

	let context: AudioContext | null = null;
	try {
		context = new AudioContext();
		context.resume();
	} catch (e) {
		console.error(e);
	}

	const sounds = new Map<number, ISound>();

	function createGainAndPanner() {
		const gain = context!.createGain();
		const panner = StereoPannerNode ? new StereoPannerNode(context!, { pan: 0 }) : undefined;
		return { gain, panner };
	}

	function setSound(id: number, buffer: Promise<AudioBuffer>) {
		const { gain, panner } = createGainAndPanner();
		sounds.set(id, { buffer, gain, panner });
	}

	return {
		create_sound_raw(id: number, data: Float32Array, length: number, channels: number, rate: number) {
			if (!context) return;
			const buffer = context.createBuffer(channels, length, rate);
			for (let i = 0; i < channels; ++i) {
				buffer.getChannelData(i).set(data.subarray(i * length, i * length + length));
			}
			setSound(id, Promise.resolve(buffer));
		},

		create_sound(id: number, data: DataView) {
			if (context) {
				setSound(id, decodeAudioData(context, data.buffer));
			}
		},

		duplicate_sound(id: number, srcId: number) {
			const src = sounds.get(srcId);
			if (src) {
				setSound(id, src.buffer);
			}
		},

		play_sound(id: number, volume: number, pan: number, loop: boolean) {
			const src = sounds.get(id);
			if (!src) return;

			src.gain.gain.value = Math.pow(2.0, volume / 1000.0);
			if (src.panner) {
				const relVolume = Math.pow(2.0, pan / 1000.0);
				src.panner.pan.value = 1.0 - 2.0 / (1.0 + relVolume);
			}

			if (src.source) {
				src.source.then((source) => source.stop());
			}

			src.source = src.buffer.then((buffer) => {
				const source = context!.createBufferSource();
				source.buffer = buffer;
				source.loop = !!loop;
				let node = source.connect(src.gain);
				if (src.panner) node = node.connect(src.panner);
				node.connect(context!.destination);
				source.start();
				return source;
			});
		},

		set_volume(id: number, volume: number) {
			const src = sounds.get(id);
			if (src) src.gain.gain.value = Math.pow(2.0, volume / 1000.0);
		},

		stop_sound(id: number) {
			const src = sounds.get(id);
			if (src?.source) {
				src.source.then((source) => source.stop());
				delete src.source;
			}
		},

		delete_sound(id: number) {
			this.stop_sound(id);
			sounds.delete(id);
		},

		stop_all() {
			for (const [, sound] of sounds) {
				if (sound.source) sound.source.then((source) => source.stop());
			}
			sounds.clear();
			context = null;
		},
	};
}
