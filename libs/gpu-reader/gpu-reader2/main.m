#include <CoreFoundation/CoreFoundation.h>
#include <Cocoa/Cocoa.h>
#include <IOKit/IOKitLib.h>

NSString *bytesToString(const void *bytes) {
    return [[[NSString alloc] initWithData: (__bridge NSData *) bytes encoding:NSASCIIStringEncoding] stringByReplacingOccurrencesOfString:@"\0" withString:@""];
}


static CFStringRef hexString(CFDataRef data)
{
    NSUInteger byteIndex, byteCount = CFDataGetLength(data);
    if (byteCount == 0) return CFSTR("0x0");
    const UInt8 *bytes = CFDataGetBytePtr(data);
    
    CFMutableStringRef str = CFStringCreateMutableCopy(kCFAllocatorDefault, 2 + 2*byteCount, CFSTR("0x"));
    for (byteIndex = 0; byteIndex < byteCount; byteIndex++) {
        CFStringAppendFormat(str, NULL, CFSTR("%02x"), bytes[byteCount - 1 - byteIndex]);
    }
    return str;
}

NSString *getVendorDeviceId(io_registry_entry_t regEntry) {
    CFDataRef vendor = IORegistryEntrySearchCFProperty(regEntry, kIOServicePlane,
                                                       CFSTR("vendor-id"),
                                                       kCFAllocatorDefault,
                                                       kIORegistryIterateRecursively|kIORegistryIterateParents);
    CFDataRef device = IORegistryEntrySearchCFProperty(regEntry, kIOServicePlane,
                                                       CFSTR("device-id"),
                                                       kCFAllocatorDefault,
                                                       kIORegistryIterateRecursively|kIORegistryIterateParents);
    if (vendor && device) {
        return [NSString stringWithFormat:@"%@-%@", hexString(vendor), hexString(device)];
    }
    
    return nil;
}

NSString *getVendorId(io_registry_entry_t regEntry) {
    CFDataRef vendor = IORegistryEntrySearchCFProperty(regEntry, kIOServicePlane,
                                                       CFSTR("vendor-id"),
                                                       kCFAllocatorDefault,
                                                       kIORegistryIterateRecursively|kIORegistryIterateParents);
    if (vendor) {
        return [NSString stringWithFormat:@"%@", hexString(vendor)];
    }
    
    return nil;
}

NSString *getDeviceId(io_registry_entry_t regEntry) {
    CFDataRef device = IORegistryEntrySearchCFProperty(regEntry, kIOServicePlane,
                                                       CFSTR("device-id"),
                                                       kCFAllocatorDefault,
                                                       kIORegistryIterateRecursively|kIORegistryIterateParents);
    if (device) {
        return [NSString stringWithFormat:@"%@", hexString(device)];
    }
    
    return nil;
}

void readIOPCIDevice(NSMutableDictionary *info) {
    io_iterator_t iterator;
    
    CFMutableDictionaryRef devicePattern = IOServiceMatching("IOPCIDevice");
    
    if (IOServiceGetMatchingServices(kIOMasterPortDefault, devicePattern, &iterator) == kIOReturnSuccess) {
        io_registry_entry_t regEntry;
        
        unsigned int acceleratorIndex = 0;
        while ((regEntry = IOIteratorNext(iterator))) {
            CFMutableDictionaryRef serviceDictionaryRef;
            if (IORegistryEntryCreateCFProperties(regEntry, &serviceDictionaryRef, kCFAllocatorDefault, kNilOptions) != kIOReturnSuccess) {
                IOObjectRelease(regEntry);
                continue;
            }
            
            NSDictionary *serviceDictionary = (__bridge NSDictionary*)serviceDictionaryRef;
            NSString *vendorDeviceId = getVendorDeviceId(regEntry);
            if (vendorDeviceId == nil) continue;
            
            NSMutableDictionary *entry = [info valueForKey:vendorDeviceId];
            if (entry == nil) continue;
            
            NSObject *GPUModel = [serviceDictionary valueForKey:@"model"];
            
            if (GPUModel != nil) {
                NSString *modelName = bytesToString((__bridge const void *)((NSString *)GPUModel));
                NSMutableDictionary *entry = [info valueForKey:vendorDeviceId];
                [entry setObject:modelName forKey:@"name"];
                
                NSString *deviceId = getDeviceId(regEntry);
                [entry setObject:deviceId forKey:@"deviceId"];
                
                NSString *vendorId = getVendorId(regEntry);
                [entry setObject:vendorId forKey:@"vendorId"];

                NSObject *builtIn = [serviceDictionary valueForKey:@"built-in"];
                if (builtIn != nil) {
                    UInt8 buf[1];
                    [(NSData *)builtIn getBytes:buf length:1];
                    [entry setObject:[NSNumber numberWithUnsignedChar:buf[0]] forKey:@"builtIn"];
                }
                
                NSObject *totalMBEntry = [entry objectForKey:@"totalMB"];
                if (totalMBEntry == nil) {
                    NSObject *VRAMtotalMB = [serviceDictionary valueForKey:@"VRAM,totalMB"];
                    if (VRAMtotalMB != nil) {
                        [entry setObject:VRAMtotalMB forKey:@"totalMB"];
                    } else {
                        [entry setObject:[NSNumber numberWithInt:0] forKey:@"totalMB"];
                    }
                }
            }
            acceleratorIndex++;
        }
    }
}

void setIoAccelerator(NSMutableDictionary *info) {
    io_iterator_t iterator;
    
    CFMutableDictionaryRef devicePattern = IOServiceMatching(kIOAcceleratorClassName);
    
    if (IOServiceGetMatchingServices(kIOMasterPortDefault, devicePattern, &iterator) == kIOReturnSuccess) {
        io_registry_entry_t regEntry;
        
        unsigned int acceleratorIndex = 0;
        while ((regEntry = IOIteratorNext(iterator))) {
            CFMutableDictionaryRef serviceDictionaryRef;
            if (IORegistryEntryCreateCFProperties(regEntry, &serviceDictionaryRef, kCFAllocatorDefault, kNilOptions) != kIOReturnSuccess) {
                IOObjectRelease(regEntry);
                continue;
            }

            NSDictionary *serviceDictionary = (__bridge NSDictionary*)serviceDictionaryRef;

            NSDictionary *performanceStats = [serviceDictionary valueForKey:@"PerformanceStatistics"];
            if (performanceStats == nil) continue;

            //Total Power(W) long
            //GPU Activity(%) long
            //Fan Speed(RPM) long
            //Fan Speed(%) long
            //Core Clock(MHz) long
            //Memory Clock(MHz) long
            //Temperature(C) long
            //Device Utilization % long
            //vramFreeBytes long

            NSString *vendorDeviceId = getVendorDeviceId(regEntry);
            NSMutableDictionary *entry = [[NSMutableDictionary alloc] init];
            [info setObject:entry forKey:vendorDeviceId];

            NSObject *VRAMtotalMB = [serviceDictionary valueForKey:@"VRAM,totalMB"];
            if (VRAMtotalMB != nil) {
                [entry setObject:VRAMtotalMB forKey:@"totalMB"];
            }
            
            //NSObject *freeBytes = [performanceStats valueForKey:@"orphanedReusableVidMemoryBytes"];
            NSObject *freeBytes = [performanceStats valueForKey:@"vramFreeBytes"];
            if (freeBytes != nil) {
                long value = [(NSNumber *)freeBytes longValue];
                [entry setObject:[NSNumber numberWithFloat:value/1024.0/1024.0] forKey:@"freeMB"];
            } else {
                [entry setObject:[NSNumber numberWithInt:0] forKey:@"freeMB"];
            }
            
            NSObject *deviceUtilisation = [performanceStats valueForKey:@"Device Utilization %"];
            if (deviceUtilisation != nil) {
                long value = [(NSNumber *)deviceUtilisation longValue];
                [entry setObject:[NSNumber numberWithFloat:value/100.0] forKey:@"utilisation"];
            } else {
                [entry setObject:[NSNumber numberWithInt:0] forKey:@"utilisation"];
            }
            NSObject *activity = [performanceStats valueForKey:@"GPU Activity(%)"];
            if (activity != nil) {
                long value = [(NSNumber *)activity longValue];
                [entry setObject:[NSNumber numberWithFloat:value/100.0] forKey:@"activity"];
            }
            
            NSObject *temperature = [performanceStats valueForKey:@"Temperature(C)"];
            if (temperature != nil) {
                [entry setObject:temperature forKey:@"temperature"];
            }
            
            NSObject *coreClock = [performanceStats valueForKey:@"Core Clock(MHz)"];
            if (coreClock != nil) {
                [entry setObject:coreClock forKey:@"coreClock"];
            }
            
            NSObject *memoryClock = [performanceStats valueForKey:@"Memory Clock(MHz)"];
            if (memoryClock != nil) {
                [entry setObject:memoryClock forKey:@"memoryClock"];
            }
            
            NSObject *fanSpeedRPM = [performanceStats valueForKey:@"Fan Speed(RPM)"];
            if (fanSpeedRPM != nil) {
                [entry setObject:fanSpeedRPM forKey:@"fanSpeedRPM"];
            }
            
            NSObject *fanSpeed = [performanceStats valueForKey:@"Fan Speed(%)"];
            if (fanSpeed != nil) {
                [entry setObject:fanSpeedRPM forKey:@"fanSpeed"];
            }
            
            NSObject *totalPower = [performanceStats valueForKey:@"Total Power(W)"];
            if (totalPower != nil) {
                [entry setObject:totalPower forKey:@"power"];
            }
            
            acceleratorIndex++;
        }
    }
}


int main(int argc, const char * argv[])
{
    NSMutableDictionary *info = [[NSMutableDictionary alloc] init];
    
    setIoAccelerator(info);
    readIOPCIDevice(info);
    
    NSError *error;
    NSData *jsonData = [NSJSONSerialization dataWithJSONObject:info options:NSJSONWritingPrettyPrinted error:&error];

    if (!jsonData) {
        NSLog(@"Got an error: %@", error);
    } else {
        printf("%s", [[[NSString alloc] initWithData:jsonData encoding:NSUTF8StringEncoding] UTF8String]);
    }
    return 0;
}
