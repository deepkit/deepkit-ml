
/*
 * Copyright (c) Marc J. Schmidt <marc@marcjschmidt.de>
 * This file is part of Deepkit and licensed under GNU GPL v3. See the LICENSE file for more information.
 */

export function humanizeTime(v: number | undefined): string {
    if (!v) return '00:00:00';
    if (v <= 0) return '00:00:00';

    const result: string[] = [];

    if (v > 60 * 60 * 24) {
        //more than a day
        const days = Math.floor(v / (60 * 60 * 24));
        if (days > 0) {
            result.push(days + ' ' + ((days === 1) ? 'day' : 'days'));
        }
    }

    v = Math.round(v);

    let hours: any = Math.floor((v / 60 / 60) % 24);
    let minutes: any = Math.floor((v / 60) % 60);
    let seconds: any = Math.floor(v % 60);
    if (hours < 10) hours = '0' + hours.toFixed(0);
    if (minutes < 10) minutes = '0' + minutes.toFixed(0);
    if (seconds < 10) seconds = '0' + seconds.toFixed(0);

    result.push(`${hours}:${minutes}:${seconds}`);

    return result.join(' ');
}
