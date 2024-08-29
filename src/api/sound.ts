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
	return new Promise((resolve, reject) => {
		context.decodeAudioData(buffer, resolve, reject);
	});
}

export default function init_sound() {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
	const StereoPannerNode = window.StereoPannerNode;
	if (!AudioContext) {
		return no_sound();
	}

	let context: AudioContext | null = null;
	try {
		context = new AudioContext();
		context.resume();
	} catch (e) {
		console.error(e);
	}

	const sounds = new Map<number, ISound>();

	return {
		create_sound_raw(id: number, data: Float32Array, length: number, channels: number, rate: number) {
			if (!context) return;
			const buffer = context.createBuffer(channels, length, rate);
			for (let i = 0; i < channels; ++i) {
				buffer.getChannelData(i).set(data.subarray(i * length, i * length + length));
			}
			sounds.set(id, {
				buffer: Promise.resolve(buffer),
				gain: context.createGain(),
				panner: StereoPannerNode ? new StereoPannerNode(context, { pan: 0 }) : undefined,
			});
		},

		create_sound(id: number, data: DataView) {
			if (!context) return;
			const buffer = decodeAudioData(context, data.buffer);
			sounds.set(id, {
				buffer,
				gain: context.createGain(),
				panner: StereoPannerNode ? new StereoPannerNode(context, { pan: 0 }) : undefined,
			});
		},

		duplicate_sound(id: number, srcId: number) {
			if (!context) return;
			const src = sounds.get(srcId);
			if (!src) return;
			sounds.set(id, {
				buffer: src.buffer,
				gain: context.createGain(),
				panner: StereoPannerNode ? new StereoPannerNode(context, { pan: 0 }) : undefined,
			});
		},

		play_sound(id: number, volume: number, pan: number, loop: boolean) {
			const src = sounds.get(id);
			if (src) {
				if (src.source) {
					src.source.then((source) => source.stop());
				}
				src.gain.gain.value = Math.pow(2.0, volume / 1000.0);
				const relVolume = Math.pow(2.0, pan / 1000.0);
				if (src.panner) {
					src.panner.pan.value = 1.0 - 2.0 / (1.0 + relVolume);
				}
				src.source = src.buffer.then((buffer) => {
					const source = context!.createBufferSource();
					source.buffer = buffer;
					source.loop = !!loop;
					let node = source.connect(src.gain);
					if (src.panner) {
						node = node.connect(src.panner);
					}
					node.connect(context!.destination);
					source.start();
					return source;
				});
			}
		},

		set_volume(id: number, volume: number) {
			const src = sounds.get(id);
			if (src) {
				src.gain.gain.value = Math.pow(2.0, volume / 1000.0);
			}
		},

		stop_sound(id: number) {
			const src = sounds.get(id);
			if (src && src.source) {
				src.source.then((source) => source.stop());
				delete src.source;
			}
		},

		delete_sound(id: number) {
			const src = sounds.get(id);
			if (src && src.source) {
				src.source.then((source) => source.stop());
			}
			sounds.delete(id);
		},

		stop_all() {
			for (const [, sound] of sounds) {
				if (sound.source) {
					sound.source.then((source) => source.stop());
				}
			}
			sounds.clear();
			context = null;
		},
	};
}
