import 'jest';


test('typed array', () => {
    // const minFloat32 = 4.627507918739843e-41;

    const float32Array = new Float32Array(1);
    float32Array[0] = 256.0;

    //big-endian (from Python
    //  data = struct.pack('!f', 256.0)
    //  base64.b64encode(data).decode('utf8')
    const float32ArrayBase64 = 'Q4AAAA==';

    const base64 = Buffer.from(float32Array.buffer).toString('base64');
    expect(base64).toBe(float32ArrayBase64);
});
